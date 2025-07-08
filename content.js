// 자막 번역기 Content Script
class SubtitleTranslator {
  constructor() {
    this.isEnabled = true;
    this.observers = new Map();
    this.translatedElements = new WeakMap();
    this.translationCache = new Map(); // 텍스트 기반 번역 캐시
    this.processingElements = new WeakSet(); // 현재 처리 중인 요소들
    this.elementDebounceTimers = new WeakMap(); // 요소별 디바운스 타이머
    this.settings = {
      targetLanguage: "ko",
      fontSize: "16px",
      backgroundColor: "rgba(0, 0, 0, 0.8)",
      textColor: "#ffffff",
      position: "bottom",
    };

    this.init();
  }

  async init() {
    // 저장된 설정 불러오기
    await this.loadSettings();

    // 자막 감지 패턴들
    this.subtitleSelectors = [
      // Udemy
      ".captions-display--captions-cue-text--TQ0DQ",

      // YouTube
      ".ytp-caption-segment",
      ".caption-window",
      ".ytp-caption-window-container",

      // Netflix
      ".player-timedtext",
      ".timedtext-text-container",

      // Vimeo
      ".vp-captions",
      ".vp-captions-text",

      // 일반적인 자막 클래스들
      ".subtitle",
      ".subtitles",
      ".captions",
      ".caption",
      '[class*="subtitle"]',
      '[class*="caption"]',

      // HTML5 video track
      'track[kind="captions"]',
      'track[kind="subtitles"]',
    ];

    this.startObserving();
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get("subtitleSettings");
      if (result.subtitleSettings) {
        this.settings = { ...this.settings, ...result.subtitleSettings };
      }
    } catch (error) {
      console.log("설정 로드 실패:", error);
    }
  }

  startObserving() {
    // 기존 자막 요소들 확인
    this.checkExistingSubtitles();

    // 최적화된 DOM 변화 감지
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "characterData") {
          // 텍스트 변경 - 가장 일반적인 자막 변화
          const element = mutation.target.parentElement;
          if (
            element &&
            this.isSubtitleElement(element) &&
            !this.isTranslatedElement(element)
          ) {
            this.processSubtitleElement(element);
          }
        } else if (mutation.type === "childList") {
          // 새 요소 추가 - 최소한의 처리
          mutation.addedNodes.forEach((node) => {
            if (
              node.nodeType === Node.ELEMENT_NODE &&
              this.isSubtitleElement(node) &&
              !this.isTranslatedElement(node)
            ) {
              this.processSubtitleElement(node);
            }
          });
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    this.observers.set("main", observer);
  }

  // 요소가 자막인지 빠르게 확인
  isSubtitleElement(element) {
    if (!element || !element.classList) return false;

    // 가장 자주 사용되는 클래스부터 확인 (성능 최적화)
    const classList = element.classList;
    return (
      classList.contains("captions-display--captions-cue-text--TQ0DQ") ||
      classList.contains("ytp-caption-segment") ||
      classList.contains("player-timedtext") ||
      classList.contains("vp-captions-text") ||
      this.matchesSubtitleSelector(element)
    );
  }

  matchesSubtitleSelector(element) {
    // 나머지 셀렉터들과 매치 확인
    const otherSelectors = [
      ".caption-window",
      ".ytp-caption-window-container",
      ".timedtext-text-container",
      ".vp-captions",
      ".subtitle",
      ".subtitles",
      ".captions",
      ".caption",
      '[class*="subtitle"]',
      '[class*="caption"]',
    ];

    return otherSelectors.some((selector) => {
      try {
        return element.matches(selector);
      } catch (e) {
        return false;
      }
    });
  }

  checkExistingSubtitles() {
    this.subtitleSelectors.forEach((selector) => {
      const elements = document.querySelectorAll(selector);
      elements.forEach((element) => {
        this.processSubtitleElement(element);
      });
    });
  }

  processSubtitleElement(element) {
    if (!this.isEnabled || !element) return;

    const text = this.extractTextContent(element);
    if (!text || text.length < 2) return;

    // 이미 처리 중인 요소는 스킵
    if (this.processingElements.has(element)) {
      return;
    }

    // 동일한 요소의 동일한 텍스트는 스킵
    if (
      this.translatedElements.has(element) &&
      this.translatedElements.get(element) === text
    ) {
      return;
    }

    // 요소별 디바운스 적용
    const existingTimer = this.elementDebounceTimers.get(element);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.translateAndInsert(element, text);
      this.elementDebounceTimers.delete(element);
    }, 300); // 디바운스 시간을 300ms로 증가

    this.elementDebounceTimers.set(element, timer);
  }

  extractTextContent(element) {
    return element.textContent?.trim() || "";
  }

  async translateAndInsert(element, text) {
    // 처리 중 표시
    this.processingElements.add(element);

    try {
      const cacheKey = `${text}:${this.settings.targetLanguage}`;

      // 다시 한번 캐시 확인 (디바운스 동안 다른 요소가 번역했을 수 있음)
      if (this.translationCache.has(cacheKey)) {
        const cachedTranslation = this.translationCache.get(cacheKey);
        this.translatedElements.set(element, text);
        return;
      }

      // 번역 요청
      const translatedText = await this.requestTranslation(text);

      if (translatedText) {
        // 캐시에 저장 (최대 100개 항목 유지)
        if (this.translationCache.size >= 100) {
          const firstKey = this.translationCache.keys().next().value;
          this.translationCache.delete(firstKey);
        }
        this.translationCache.set(cacheKey, translatedText);

        this.translatedElements.set(element, text);
        console.log(`[원문] ${text}`);
        console.log(`[번역] ${translatedText}`);
      }
    } catch (error) {
      console.error("번역 실패:", error);
    } finally {
      // 처리 완료 표시
      this.processingElements.delete(element);
    }
  }

  async requestTranslation(text) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          action: "translate",
          text: text,
          targetLanguage: this.settings.targetLanguage,
        },
        (response) => {
          resolve(response?.translatedText || null);
        }
      );
    });
  }

  // 설정 업데이트
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    // 언어가 변경되면 캐시 초기화
    if (
      newSettings.targetLanguage &&
      newSettings.targetLanguage !== this.settings.targetLanguage
    ) {
      this.translationCache.clear();
      console.log("[설정 변경] 번역 캐시 초기화");
    }
  }

  // 활성화/비활성화
  toggle() {
    this.isEnabled = !this.isEnabled;
    console.log(`[번역기 ${this.isEnabled ? "활성화" : "비활성화"}]`);
  }

  // 정리
  destroy() {
    this.observers.forEach((observer) => observer.disconnect());
    this.observers.clear();

    // 모든 디바운스 타이머 정리
    this.elementDebounceTimers = new WeakMap();

    // 캐시 정리
    this.translationCache.clear();
    this.processingElements = new WeakSet();
  }

  // 번역된 자막 요소인지 확인
  isTranslatedElement(element) {
    if (!element) return false;

    // 번역 자막 자체이거나 그 하위 요소인지 확인
    return (
      element.classList.contains("translated-subtitle") ||
      element.closest(".translated-subtitle") !== null
    );
  }
}

// 전역 인스턴스 생성
let subtitleTranslator = null;

// 페이지 로드 시 초기화
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeTranslator);
} else {
  initializeTranslator();
}

function initializeTranslator() {
  if (!subtitleTranslator) {
    subtitleTranslator = new SubtitleTranslator();
  }
}

// 확장자 메시지 리스너
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "toggle") {
    subtitleTranslator?.toggle();
    sendResponse({ success: true });
  } else if (request.action === "updateSettings") {
    subtitleTranslator?.updateSettings(request.settings);
    sendResponse({ success: true });
  } else if (request.action === "init") {
    // background.js에서 초기화 신호를 받으면 확장자 재시작
    if (!subtitleTranslator) {
      initializeTranslator();
    }
    sendResponse({ success: true });
  }
});

// 페이지 언로드 시 정리
window.addEventListener("beforeunload", () => {
  subtitleTranslator?.destroy();
});
