# Content Review Status

Status: technically validated, teacher review still required.

## Inventory

- 506 defined vocabulary terms
- Grades 6, 7, and 8
- 24 curriculum topics
- 178 lesson records
- 170 playable lessons
- playable distribution: Grade 6 has 53, Grade 7 has 57, Grade 8 has 60
- zero unresolved references from curriculum lessons to TERMS entries

The definitions and examples were drafted for classroom readability but have
not been verified against the named curriculum publishers or state wording.
Teacher review remains the highest content-quality requirement. Technical tests
cannot establish instructional accuracy, grade appropriateness, licensing
rights, or curriculum alignment.

## Missing vocabulary

Grade 6 Topic 7, Solve Area, Surface Area, and Volume Problems, is marked
incomplete and displayed as coming soon. Its eight lessons have no terms:

1. 7-1 Find Areas of Parallelograms and Rhombuses
2. 7-2 Solve Triangle Area Problems
3. 7-3 Find Areas of Trapezoids and Kites
4. 7-4 Find Areas of Polygons
5. 7-5 Represent Solid Figures Using Nets
6. 7-6 Find Surface Area of Prisms
7. 7-7 Find Surface Areas of Pyramids
8. 7-8 Find Volume with Fractional Edge Lengths

The UI disables this topic and labels it as unavailable rather than opening an
empty game.

## Thin lessons

These Grade 7 lessons resolve to fewer than four placeable grid words:

| Lesson | Placeable words | Title |
| --- | ---: | --- |
| 1-2 | 2 | Understand Rational Numbers |
| 1-10 | 3 | Solve Problems with Rational Numbers |
| 3-4 | 2 | Solve Percent Change and Percent Error Problems |
| 3-6 | 3 | Solve Simple Interest Problems |
| 4-2 | 3 | Generate Equivalent Expressions |
| 4-3 | 3 | Simplify Expressions |
| 4-7 | 2 | Subtract Expressions |
| 6-1 | 3 | Populations and Samples |
| 6-2 | 3 | Draw Inferences from Data |
| 7-1 | 3 | Understand Likelihood and Probability |
| 7-4 | 2 | Use Probability Models |
| 7-5 | 3 | Determine Outcomes of Compound Events |
| 8-8 | 1 | Solve Problems Involving Surface Area |

Thin lessons remain playable, and Combine Mode lets a teacher combine two or
more lessons into a fuller grid. The regression suite verifies that behavior.

## Review workflow

For every reviewed term:

1. confirm the display term and spelling;
2. confirm the definition and example;
3. verify grade-level language;
4. confirm the referenced grade/topic/lesson;
5. check whether full-word, anchor-word, or clue-only treatment is appropriate;
6. run npm run test:content;
7. run the canonical browser suite; and
8. record reviewer, date, and source in a future owner-approved review log.

Do not represent the current library as publisher-approved or legally reviewed.
