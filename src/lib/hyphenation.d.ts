declare module 'hypher' {
  export default class Hypher {
    constructor(language: unknown);
    hyphenate(word: string): string[];
    hyphenateText(text: string, minLength?: number): string;
  }
}

declare module 'hyphenation.en-us' {
  const patterns: unknown;
  export default patterns;
}
