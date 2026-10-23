// Default prompts for one-off brand assets.
//
// The skill still authors the prompt when the task needs judgment. These builders
// cover the plain case: a favicon and a wordmark from the site name, colours and
// topic, so the script runs without a hand-written string.

/** Flat vector icon: one thematic symbol, square, no text. */
export function faviconPrompt({ name = "site", topic = "", bg = "#1f1f1f", fg = "#ffffff" } = {}) {
  const subject = topic ? `a simple symbol for ${topic}` : "a simple symbol for the site";
  return {
    prompt: [
      `Flat vector icon for ${name}: ${subject},`,
      `${fg} on ${bg}, geometric shapes, square composition, centered,`,
      "high contrast, crisp edges, no text, no gradient, no photo",
    ].join(" "),
    negativePrompt:
      "text, letters, words, photo, 3D render, gradients, colorful, busy background, watermark, mockup, people, hands, complex details",
  };
}

/** Wordmark: the site name as text, plus a small icon, wide 3:1 frame. */
export function logoPrompt({ name, topic = "", bg = "#1f1f1f", fg = "#ffffff" } = {}) {
  const site = topic ? ` for a ${topic} site` : "";
  return {
    prompt: [
      `Minimalist tech wordmark logo${site}: the word "${name}" in clean geometric`,
      `sans-serif lowercase letters, ${fg} text on ${bg} background, a small thematic`,
      "icon before the text in the same color, flat vector style, crisp edges,",
      "generous horizontal padding, centered composition, high contrast,",
      "no gradient, no shadow, no photo",
    ].join(" "),
    negativePrompt:
      "misspelled text, extra letters, blurry, photo, 3D render, gradients, colorful, busy background, multiple words, tagline, watermark, mockup, people, hands",
  };
}
