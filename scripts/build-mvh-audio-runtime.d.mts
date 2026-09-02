// Type surface of the version-atomic audio runtime builder, for the vitest
// gate that regenerates the artifact and compares it to the committed one.
export declare function buildMvhAudioRuntime(
  voiceSource: string,
  musicSource: string
): { hash: string; fileName: string; content: string };
export declare function readSources(): { voiceSource: string; musicSource: string };
