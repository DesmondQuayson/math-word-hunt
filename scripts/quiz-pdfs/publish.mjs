// Quiz PDFs V1 - publish the manifest into a MathNexa content database.
//
// This walks exactly the path the admin interface walks (phase 8B/8D/9B): the
// same security-definer RPCs, the same private `resource-files` bucket, the
// same structural PDF validator and the same draft -> validating ->
// ready_for_review -> published transitions. Nothing here bypasses the content
// admin authority: every mutation names an active, MFA-enrolled owner row.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { inspectPdfUpload } from "../../packages/platform-core/src/admin-files/pdf-validation.ts";
import { sha256Of } from "./manifest.mjs";
import { planGrade, planQuiz, planTopics, publicationSteps } from "./plan.mjs";

const QUIZ_TYPES = ["quiz_pdf", "quiz_answer_key"];

function unwrap(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message ?? String(result.error)}`);
  return result.data;
}

export async function readTaxonomy(client) {
  const grades = unwrap(await client.from("content_grades").select("id,grade_number,title,slug,sort_order,publication_state,lock_version").neq("publication_state", "archived").order("sort_order"), "read grades");
  const topics = unwrap(await client.from("content_topics").select("id,grade_id,title,slug,sort_order,publication_state,lock_version").neq("publication_state", "archived").order("sort_order"), "read topics");
  return Object.freeze({
    grades: Object.freeze(grades.map((row) => ({ id: row.id, gradeNumber: row.grade_number, title: row.title, slug: row.slug, sortOrder: row.sort_order, publicationState: row.publication_state, lockVersion: Number(row.lock_version) }))),
    topics: Object.freeze(topics.map((row) => ({ id: row.id, gradeId: row.grade_id, title: row.title, slug: row.slug, sortOrder: row.sort_order, publicationState: row.publication_state, lockVersion: Number(row.lock_version) })))
  });
}

export async function readTopicQuizzes(client, topicIds) {
  if (!topicIds.length) return Object.freeze([]);
  const assignments = unwrap(await client.from("topic_resource_assignments").select("id,topic_id,resource_id,slug,sort_order,lock_version").in("topic_id", topicIds), "read topic assignments");
  const resourceIds = assignments.map((row) => row.resource_id);
  if (!resourceIds.length) return Object.freeze([]);
  const [resources, versions, files] = await Promise.all([
    client.from("content_resources").select("id,resource_type,publication_state,current_version_number,published_version_number,lock_version,resource_scope,scope_status").in("id", resourceIds),
    client.from("content_resource_versions").select("id,resource_id,version_number,publication_state,title,source_version_id").in("resource_id", resourceIds),
    client.from("resource_files").select("id,resource_id,resource_version_number,file_role,sha256,byte_size,validation_state,normalized_filename,original_filename,bucket_id,object_path").in("resource_id", resourceIds).eq("file_role", "primary_pdf")
  ]);
  const resourceRows = unwrap(resources, "read resources");
  const versionRows = unwrap(versions, "read resource versions");
  const fileRows = unwrap(files, "read resource files");
  return Object.freeze(assignments.flatMap((assignment) => {
    const resource = resourceRows.find((row) => row.id === assignment.resource_id);
    if (!resource || !QUIZ_TYPES.includes(resource.resource_type)) return [];
    const version = versionRows.find((row) => row.resource_id === resource.id && row.version_number === resource.current_version_number) ?? null;
    const sourceVersion = version?.source_version_id ? versionRows.find((row) => row.id === version.source_version_id)?.version_number ?? null : null;
    const fileVersion = sourceVersion ?? resource.current_version_number;
    const file = fileRows.find((row) => row.resource_id === resource.id && row.resource_version_number === fileVersion && row.validation_state === "accepted")
      ?? fileRows.find((row) => row.resource_id === resource.id && row.resource_version_number === fileVersion) ?? null;
    return [Object.freeze({
      assignmentId: assignment.id, topicId: assignment.topic_id, resourceId: resource.id, slug: assignment.slug, sortOrder: assignment.sort_order,
      resourceType: resource.resource_type, publicationState: resource.publication_state, currentVersion: resource.current_version_number,
      publishedVersion: resource.published_version_number, lockVersion: Number(resource.lock_version), resourceScope: resource.resource_scope,
      scopeStatus: resource.scope_status, versionState: version?.publication_state ?? null, title: version?.title ?? null,
      fileId: file?.id ?? null, fileSha256: file?.sha256 ?? null, fileBytes: file?.byte_size ?? null, fileState: file?.validation_state ?? null,
      fileName: file?.normalized_filename ?? null, originalFilename: file?.original_filename ?? null
    })];
  }));
}

export async function buildQuizPlan({ client, manifest }) {
  const taxonomy = await readTaxonomy(client);
  const grades = [];
  for (const grade of manifest.grades) {
    const gradePlan = planGrade(taxonomy.grades, grade);
    const existingTopics = gradePlan.action === "reuse" ? taxonomy.topics.filter((topic) => topic.gradeId === gradePlan.existing.id) : [];
    const topicPlans = planTopics(existingTopics, grade.topics);
    const reusedTopicIds = topicPlans.filter((plan) => plan.action === "reuse").map((plan) => plan.existing.id);
    const existingQuizzes = await readTopicQuizzes(client, reusedTopicIds);
    const topics = topicPlans.map((plan) => Object.freeze({
      ...plan,
      quiz: planQuiz(plan.action === "reuse" ? existingQuizzes.filter((entry) => entry.topicId === plan.existing.id) : [], plan.manifest.quiz)
    }));
    grades.push(Object.freeze({ manifest: grade, ...gradePlan, topics: Object.freeze(topics) }));
  }
  const conflicts = grades.flatMap((grade) => [
    ...(grade.action === "conflict" ? [{ kind: "grade", grade: grade.manifest.gradeNumber, reason: grade.reason }] : []),
    ...grade.topics.filter((topic) => topic.quiz.action === "conflict").map((topic) => ({ kind: "quiz", grade: grade.manifest.gradeNumber, topic: topic.manifest.slug, quiz: topic.manifest.quiz.slug, reason: topic.quiz.reason }))
  ]);
  const count = (action) => grades.flatMap((grade) => grade.topics).filter((topic) => topic.quiz.action === action).length;
  return Object.freeze({
    grades: Object.freeze(grades),
    conflicts: Object.freeze(conflicts),
    summary: Object.freeze({
      gradesToCreate: grades.filter((grade) => grade.action === "create").length,
      gradesToReuse: grades.filter((grade) => grade.action === "reuse").length,
      topicsToCreate: grades.flatMap((grade) => grade.topics).filter((topic) => topic.action === "create").length,
      topicsToReuse: grades.flatMap((grade) => grade.topics).filter((topic) => topic.action === "reuse").length,
      quizzesToCreate: count("create"), quizzesToPublish: count("publish"), quizzesToSkip: count("skip"), conflicts: conflicts.length
    })
  });
}

export function describePlan(plan) {
  const lines = [];
  for (const grade of plan.grades) {
    lines.push(`Grade ${grade.manifest.gradeNumber} "${grade.manifest.title}": ${grade.action}${grade.existing ? ` (existing ${grade.existing.id}, ${grade.existing.publicationState})` : ` (sort order ${grade.sortOrder})`}${grade.reason ? ` - ${grade.reason}` : ""}`);
    for (const topic of grade.topics) {
      lines.push(`  Topic ${topic.sortOrder} "${topic.manifest.title}": ${topic.action}${topic.existing ? ` (existing ${topic.existing.id}, ${topic.existing.publicationState})` : ""}`);
      lines.push(`    Quiz "${topic.manifest.quiz.title}" [${topic.manifest.quiz.slug}]: ${topic.quiz.action}${topic.quiz.reason ? ` - ${topic.quiz.reason}` : ""}`);
    }
  }
  const s = plan.summary;
  lines.push(`Summary: grades create ${s.gradesToCreate} / reuse ${s.gradesToReuse}; topics create ${s.topicsToCreate} / reuse ${s.topicsToReuse}; quizzes create ${s.quizzesToCreate}, publish ${s.quizzesToPublish}, skip ${s.quizzesToSkip}, conflicts ${s.conflicts}`);
  return lines.join("\n");
}

async function publishTaxonomyNode({ client, actorAdminId, kind, node }) {
  const rpc = kind === "grade" ? "update_content_grade" : "update_content_topic";
  const idKey = kind === "grade" ? "p_grade_id" : "p_topic_id";
  let lockVersion = node.lockVersion;
  for (const state of publicationSteps(node.publicationState)) {
    lockVersion = Number(unwrap(await client.rpc(rpc, {
      p_actor_admin_id: actorAdminId, [idKey]: node.id, p_expected_lock_version: lockVersion,
      p_title: node.title, p_slug: node.slug, p_sort_order: node.sortOrder, p_publication_state: state
    }), `publish ${kind} ${node.slug} -> ${state}`));
  }
  return lockVersion;
}

async function storeQuizPdf({ client, actorAdminId, resourceId, quiz, log }) {
  const bytes = readFileSync(quiz.absolutePath);
  const sha256 = sha256Of(bytes);
  if (sha256 !== quiz.sha256 || bytes.length !== quiz.bytes) throw new Error(`stored file for ${quiz.slug} does not match the manifest (sha256/bytes)`);
  const inspection = inspectPdfUpload({ filename: quiz.downloadFilename, mimeType: "application/pdf", bytes: new Uint8Array(bytes) });
  if (inspection.decision !== "accepted") throw new Error(`${quiz.slug} would be quarantined: ${inspection.findings.map((item) => item.code).join(", ")}`);
  const objectPath = `resources/${resourceId}/v1/${randomUUID()}-${quiz.downloadFilename}`;
  unwrap(await client.storage.from("resource-files").upload(objectPath, bytes, { contentType: "application/pdf", upsert: false, cacheControl: "private, max-age=0" }), `upload ${quiz.slug}`);
  const registered = await client.rpc("register_resource_file", {
    p_actor_admin_id: actorAdminId, p_resource_id: resourceId, p_resource_version_number: 1, p_file_role: "primary_pdf",
    p_original_filename: quiz.sourceFile, p_normalized_filename: quiz.downloadFilename, p_bucket_id: "resource-files", p_object_path: objectPath,
    p_mime_type: "application/pdf", p_byte_size: bytes.length, p_sha256: sha256, p_validation_state: "accepted",
    p_validation_report: { validator: "phase8d-pdf-structure-v1", findings: [], acroform: inspection.hasAcroForm, malware_scan: "structural-fail-closed", source: "quiz-pdfs-manifest-v1", source_file: quiz.sourceFile },
    p_replaces_file_id: null
  });
  if (registered.error) {
    await client.storage.from("resource-files").remove([objectPath]);
    throw new Error(`register ${quiz.slug}: ${registered.error.message}`);
  }
  log(`  stored ${quiz.downloadFilename} (${bytes.length} bytes, sha256 ${sha256.slice(0, 12)}...) as file ${registered.data}`);
  return registered.data;
}

export async function applyQuizPlan({ client, actorAdminId, plan, log = console.log }) {
  if (plan.conflicts.length) throw new Error(`refusing to apply a plan with ${plan.conflicts.length} conflict(s); resolve them in the admin first`);
  const outcome = { grades: [], topics: [], created: [], published: [], skipped: [] };
  for (const gradePlan of plan.grades) {
    const grade = gradePlan.manifest;
    let gradeNode;
    if (gradePlan.action === "create") {
      const id = unwrap(await client.rpc("create_content_grade", { p_actor_admin_id: actorAdminId, p_grade_number: grade.gradeNumber, p_title: grade.title, p_slug: grade.slug, p_sort_order: gradePlan.sortOrder }), `create grade ${grade.slug}`);
      gradeNode = { id, title: grade.title, slug: grade.slug, sortOrder: gradePlan.sortOrder, publicationState: "draft", lockVersion: 1 };
      log(`created grade ${grade.title} (${id})`);
    } else {
      gradeNode = { ...gradePlan.existing };
      log(`reusing grade ${gradeNode.title} (${gradeNode.id}, ${gradeNode.publicationState})`);
    }
    if (gradeNode.publicationState !== "published") {
      await publishTaxonomyNode({ client, actorAdminId, kind: "grade", node: gradeNode });
      log(`  published grade ${gradeNode.title}`);
    }
    outcome.grades.push({ gradeNumber: grade.gradeNumber, id: gradeNode.id, action: gradePlan.action });
    for (const topicPlan of gradePlan.topics) {
      const topic = topicPlan.manifest;
      let topicNode;
      if (topicPlan.action === "create") {
        const id = unwrap(await client.rpc("create_content_topic", { p_actor_admin_id: actorAdminId, p_grade_id: gradeNode.id, p_title: topic.title, p_slug: topic.slug, p_sort_order: topicPlan.sortOrder }), `create topic ${topic.slug}`);
        topicNode = { id, title: topic.title, slug: topic.slug, sortOrder: topicPlan.sortOrder, publicationState: "draft", lockVersion: 1 };
        log(`created topic ${topicPlan.sortOrder} "${topic.title}" (${id})`);
      } else {
        topicNode = { ...topicPlan.existing };
        log(`reusing topic ${topicNode.sortOrder} "${topicNode.title}" (${topicNode.id}, ${topicNode.publicationState})`);
      }
      if (topicNode.publicationState !== "published") {
        await publishTaxonomyNode({ client, actorAdminId, kind: "topic", node: topicNode });
        log(`  published topic "${topicNode.title}"`);
      }
      outcome.topics.push({ slug: topic.slug, id: topicNode.id, action: topicPlan.action, sortOrder: topicNode.sortOrder });
      const quiz = topic.quiz;
      const quizPlan = topicPlan.quiz;
      if (quizPlan.action === "skip") {
        log(`  quiz "${quiz.title}" already published with the identical file (${quizPlan.existing.resourceId}); skipped`);
        outcome.skipped.push({ slug: quiz.slug, resourceId: quizPlan.existing.resourceId, topicId: topicNode.id });
        continue;
      }
      let resourceId;
      let lockVersion;
      let versionNumber;
      let state;
      if (quizPlan.action === "create") {
        resourceId = unwrap(await client.rpc("create_topic_content_resource", {
          p_actor_admin_id: actorAdminId, p_topic_id: topicNode.id, p_resource_type: "quiz_pdf", p_slug: quiz.slug, p_sort_order: quizPlan.sortOrder,
          p_title: quiz.title, p_description: quiz.description, p_thumbnail_path: null, p_tags: [...quiz.tags],
          p_content_manifest: { asset_kind: "interactive_pdf", answer_key: quiz.answerKey, source_file: quiz.sourceFile, source_sha256: quiz.sha256, pages: quiz.pages, quiz_manifest_version: 1 }
        }), `create quiz ${quiz.slug}`);
        log(`  created quiz "${quiz.title}" (${resourceId})`);
        await storeQuizPdf({ client, actorAdminId, resourceId, quiz, log });
        lockVersion = 1;
        versionNumber = 1;
        state = "draft";
        outcome.created.push({ slug: quiz.slug, resourceId, topicId: topicNode.id });
      } else {
        resourceId = quizPlan.existing.resourceId;
        lockVersion = quizPlan.existing.lockVersion;
        versionNumber = quizPlan.existing.currentVersion;
        state = quizPlan.existing.versionState ?? quizPlan.existing.publicationState;
      }
      for (const nextState of publicationSteps(state)) {
        lockVersion = Number(unwrap(await client.rpc("transition_content_resource", {
          p_actor_admin_id: actorAdminId, p_resource_id: resourceId, p_version_number: versionNumber, p_expected_lock_version: lockVersion, p_publication_state: nextState
        }), `publish quiz ${quiz.slug} -> ${nextState}`));
      }
      log(`  published quiz "${quiz.title}" (${resourceId})`);
      outcome.published.push({ slug: quiz.slug, resourceId, topicId: topicNode.id });
    }
  }
  return Object.freeze(outcome);
}

/** Read-only proof that every manifest quiz is live: published, topic-scoped, current, with the exact accepted file. */
export async function verifyQuizPublication({ client, manifest }) {
  const taxonomy = await readTaxonomy(client);
  const results = [];
  for (const grade of manifest.grades) {
    const gradeRow = taxonomy.grades.find((row) => row.gradeNumber === grade.gradeNumber) ?? null;
    const gradeTopics = gradeRow ? taxonomy.topics.filter((topic) => topic.gradeId === gradeRow.id) : [];
    const topicPlans = planTopics(gradeTopics, grade.topics);
    const quizzes = await readTopicQuizzes(client, topicPlans.filter((plan) => plan.existing).map((plan) => plan.existing.id));
    for (const plan of topicPlans) {
      const quiz = plan.manifest.quiz;
      const problems = [];
      if (!gradeRow) problems.push("grade-missing");
      else if (gradeRow.publicationState !== "published") problems.push(`grade-${gradeRow.publicationState}`);
      if (!plan.existing) problems.push("topic-missing");
      else if (plan.existing.publicationState !== "published") problems.push(`topic-${plan.existing.publicationState}`);
      const topicQuizzes = plan.existing ? quizzes.filter((entry) => entry.topicId === plan.existing.id && entry.resourceType === "quiz_pdf") : [];
      const live = topicQuizzes.find((entry) => entry.slug === quiz.slug) ?? null;
      if (!live) problems.push("quiz-missing");
      else {
        if (live.publicationState !== "published") problems.push(`quiz-${live.publicationState}`);
        if (live.resourceScope !== "topic" || live.scopeStatus !== "current") problems.push("quiz-not-topic-scoped");
        if (live.fileState !== "accepted") problems.push("file-not-accepted");
        if (live.fileSha256 !== quiz.sha256) problems.push("file-sha256-mismatch");
        if (live.fileBytes !== quiz.bytes) problems.push("file-size-mismatch");
        if (live.fileName !== quiz.downloadFilename) problems.push("download-filename-mismatch");
        if (live.title !== quiz.title) problems.push("title-mismatch");
      }
      const publishedInTopic = topicQuizzes.filter((entry) => entry.publicationState === "published").length;
      if (publishedInTopic > 1) problems.push("multiple-published-quizzes-in-topic");
      results.push(Object.freeze({
        gradeNumber: grade.gradeNumber, topic: plan.manifest.title, topicSortOrder: plan.existing?.sortOrder ?? null, slug: quiz.slug, title: quiz.title,
        resourceId: live?.resourceId ?? null, topicId: plan.existing?.id ?? null, ok: problems.length === 0, problems: Object.freeze(problems)
      }));
    }
  }
  return Object.freeze({ ok: results.every((item) => item.ok), results: Object.freeze(results) });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function findAuthUserByEmail(client, email) {
  const wanted = email.trim().toLowerCase();
  for (let page = 1; page <= 50; page += 1) {
    const listed = unwrap(await client.auth.admin.listUsers({ page, perPage: 200 }), "list users");
    const match = listed.users.find((user) => (user.email ?? "").toLowerCase() === wanted);
    if (match) return match;
    if (listed.users.length < 200) break;
  }
  return null;
}

export async function resolveActorAdmin({ client, email = null, adminId = null }) {
  let query = client.from("admin_users").select("id,user_id,role,mfa_enrolled,revoked_at");
  if (adminId) {
    if (!UUID.test(adminId)) throw new Error("actor admin id must be a UUID");
    query = query.eq("id", adminId);
  } else if (email) {
    const user = await findAuthUserByEmail(client, email);
    if (!user) throw new Error("no account with that email address");
    query = query.eq("user_id", user.id);
  } else throw new Error("an actor (email or admin id) is required");
  const rows = unwrap(await query, "read admin users");
  const row = rows.find((entry) => entry.revoked_at === null) ?? null;
  if (!row) throw new Error("no active admin row for that actor");
  if (row.role !== "owner" || !row.mfa_enrolled) throw new Error("the actor must be an MFA-enrolled owner");
  return row.id;
}

/**
 * A synthetic, MFA-marked owner row used only to seed content where no real
 * owner session exists (the local harness and the isolated staging project).
 * It is revoked as soon as the seed finishes; the content it created keeps
 * its audit trail (created_by) exactly like an admin-interface upload.
 */
export async function createSyntheticOwner({ client, runId }) {
  const email = `quiz-pdfs-seed-${runId}@example.invalid`;
  const password = `${randomUUID()}${randomUUID()}`;
  const created = unwrap(await client.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { synthetic_run_id: runId, purpose: "quiz-pdfs-seed" } }), "create synthetic owner");
  const row = unwrap(await client.from("admin_users").insert({ user_id: created.user.id, role: "owner", mfa_enrolled: true }).select("id").single(), "create synthetic admin row");
  return Object.freeze({ adminId: row.id, userId: created.user.id, email });
}

export async function revokeSyntheticOwner({ client, userId }) {
  // The service role may only read and insert admin rows; revocation goes
  // through the audited emergency-revocation RPC exactly like the CLI does.
  unwrap(await client.rpc("revoke_admin_access", { p_user_id: userId, p_reason: "quiz-pdfs seed finished", p_ip: null, p_user_agent: "quiz-pdfs-publish-cli" }), "revoke synthetic owner");
}
