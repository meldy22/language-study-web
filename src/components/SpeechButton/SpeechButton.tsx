import { useEffect, useState } from "react";

import styles from "./SpeechButton.module.css";

type SpeechButtonProps = {
  text: string;
  className?: string;
  lang?: string;
};

export default function SpeechButton({ text, className = "", lang = "en-US" }: SpeechButtonProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => () => {
    window.speechSynthesis?.cancel();
  }, []);

  function speak() {
    if (!isSupported) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }

  return (
    <button
      aria-label={`${text} pronunciation`}
      className={`${styles.button} ${isSpeaking ? styles.speaking : ""} ${className}`}
      disabled={!isSupported}
      onClick={speak}
      title={isSupported ? `Listen to ${text}` : "Speech playback is not supported by this browser"}
      type="button"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M4 9v6h4l5 4V5L8 9H4Z" />
        <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />
      </svg>
    </button>
  );
}
