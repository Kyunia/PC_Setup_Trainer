const JSTRIS_REPLAY_PATH = /^\/replay\/([0-9]{1,32})\/?$/;

export function jstrisReplayUrlFromViewerPath(pathname: string): string | null {
  const match = JSTRIS_REPLAY_PATH.exec(pathname);
  return match ? `https://jstris.jezevec10.com/replay/${match[1]}` : null;
}
