export type VocabularyWord = {
  id: number;
  word: string;
  meaning: string;
  furigana: string;
  romaji: string;
  level: number;
  jlpt_example_sentences?: ExampleSentence[];
};

export type ExampleSentence = {
  id: number;
  japanese: string;
  reading: string;
  translation_ko: string;
  is_verified: boolean;
};
