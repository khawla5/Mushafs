/** True only in the static demo build (`npm run build:demo` / `npm run dev:demo`). */
export const DEMO = import.meta.env.MODE === 'demo';

/** The single short recording every version plays in the demo. */
export const DEMO_AUDIO = `${import.meta.env.BASE_URL}demo/recitation.mp3`;
