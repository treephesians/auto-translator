// 자막 번역기 Content Script
class SubtitleTranslator {
  constructor() {
    this.isEnabled = true;
    this.observers = new Map();
    this.translatedElements = new WeakMap();
    this.translationCache = new Map(); // 텍스트 기반 번역 캐시
    this.processingElements = new WeakSet(); // 현재 처리 중인 요소들
    this.elementDebounceTimers = new WeakMap(); // 요소별 디바운스 타이머

    // 고정 설정값
    this.targetLanguage = "ko"; // 한국어 고정

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
      const result = await chrome.storage.sync.get(["isEnabled"]);

      // isEnabled 상태 로드
      if (result.isEnabled !== undefined) {
        this.isEnabled = result.isEnabled;
      }
    } catch (error) {
      console.error("설정 로드 실패:", error);
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
    if (!this.isEnabled || !element) {
      return;
    }

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

    // 새로운 자막이 나타나면 이전 번역 요소들 정리
    this.cleanupOldTranslations();

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

  // 이전 번역 요소들 정리
  cleanupOldTranslations() {
    const allTranslations = document.querySelectorAll(".translated-subtitle");
    allTranslations.forEach((translation) => {
      // 해당 번역의 원본 자막이 여전히 존재하는지 확인
      const prevSibling = translation.previousElementSibling;
      if (!prevSibling || !this.isSubtitleElement(prevSibling)) {
        // 원본이 없거나 자막 요소가 아니면 제거
        translation.remove();
      } else {
        // 원본 자막이 여전히 활성 상태인지 확인 (보이는 상태 등)
        const isVisible = prevSibling.offsetParent !== null;
        if (!isVisible) {
          translation.remove();
        }
      }
    });
  }

  extractTextContent(element) {
    return element.textContent?.trim() || "";
  }

  async translateAndInsert(element, text) {
    // 처리 중 표시
    this.processingElements.add(element);

    try {
      const cacheKey = `${text}:${this.targetLanguage}`;

      // 다시 한번 캐시 확인 (디바운스 동안 다른 요소가 번역했을 수 있음)
      if (this.translationCache.has(cacheKey)) {
        const cachedTranslation = this.translationCache.get(cacheKey);
        this.translatedElements.set(element, text);
        this.displayTranslation(element, text, cachedTranslation);
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
        this.displayTranslation(element, text, translatedText);
      }
    } catch (error) {
      console.error("번역 실패:", error);
    } finally {
      // 처리 완료 표시
      this.processingElements.delete(element);
    }
  }

  displayTranslation(element, originalText, translatedText) {
    // 기존 번역 요소가 있는지 확인 (형제 요소로 찾기)
    let translationElement = element.previousElementSibling;
    if (
      translationElement &&
      !translationElement.classList.contains("translated-subtitle")
    ) {
      translationElement = null;
    }

    if (translationElement) {
      // 기존 요소가 있으면 텍스트만 업데이트
      translationElement.textContent = translatedText;
    } else {
      // 부모 컨테이너의 레이아웃 강제 변경
      const parentElement = element.parentNode;
      if (parentElement && !parentElement.dataset.layoutModified) {
        parentElement.style.cssText += `
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          justify-content: center !important;
          text-align: center !important;
          width: 100% !important;
          margin-bottom: 30px !important;
        `;
        parentElement.dataset.layoutModified = "true";
      }

      // 원본 요소도 레이아웃 강제 변경
      if (!element.dataset.originalStyle) {
        element.dataset.originalStyle = element.style.cssText;
        element.style.cssText += `
          border-bottom: 1px solid rgba(255,255,255,0.2) !important;
          padding-bottom: 2px !important;
          margin-bottom: 0px !important;
          margin-top: 4px !important;
          display: block !important;
          width: 100% !important;
          clear: both !important;
          float: none !important;
          flex: none !important;
          grid-column: span 2 !important;
        `;
      }

      // 번역 요소 생성
      translationElement = document.createElement("div");
      translationElement.className = "translated-subtitle";
      translationElement.textContent = translatedText;

      // 번역문 스타일 적용 (원문과 구분되는 스타일)
      translationElement.style.cssText = `
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        position: relative !important;
        z-index: 999999 !important;
        font-size: 24px !important;
        color: #FFD700 !important;
        background-color: rgba(0, 0, 0, 0.7) !important;
        padding: 4px 8px !important;
        margin-top: 0px !important;
        margin-bottom: 4px !important;
        margin-left: 0px !important;
        margin-right: 0px !important;
        border-radius: 0px !important;
        line-height: 1.2 !important;
        font-weight: 500 !important;
        white-space: pre-wrap !important;
        word-wrap: break-word !important;
        max-width: fit-content !important;
        width: auto !important;
        clear: both !important;
        float: none !important;
        flex: none !important;
        grid-column: span 2 !important;
      `;

      // CSS 가상 요소 차단을 위한 추가 스타일 삽입
      if (!document.getElementById("subtitle-translator-styles")) {
        const style = document.createElement("style");
        style.id = "subtitle-translator-styles";
        style.textContent = `
          .translated-subtitle::before,
          .translated-subtitle::after {
            display: none !important;
            content: none !important;
          }
        `;
        document.head.appendChild(style);
      }

      // 원본 자막 요소 앞에 번역 요소 삽입 (번역문이 위에 오도록)
      element.parentNode.insertBefore(translationElement, element);
    }
  }

  async requestTranslation(text) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          action: "translate",
          text: text,
          targetLanguage: this.targetLanguage,
        },
        (response) => {
          resolve(response?.translatedText || null);
        }
      );
    });
  }

  // 설정은 더 이상 사용하지 않음 (고정값 사용)

  // 활성화/비활성화
  toggle() {
    this.isEnabled = !this.isEnabled;

    // 비활성화 시 모든 번역 요소 제거
    if (!this.isEnabled) {
      this.removeAllTranslations();
    }
  }

  // 모든 번역 요소 제거
  removeAllTranslations() {
    const allTranslations = document.querySelectorAll(".translated-subtitle");
    allTranslations.forEach((translation) => {
      translation.remove();
    });

    // 번역 캐시와 처리 상태도 초기화
    this.translationCache.clear();
    this.translatedElements = new WeakMap();
    this.processingElements = new WeakSet();

    // 원본 자막들의 수정된 스타일도 복원
    this.restoreOriginalStyles();
  }

  // 원본 자막들의 스타일 복원
  restoreOriginalStyles() {
    // 수정된 부모 컨테이너들 복원
    const modifiedParents = document.querySelectorAll(
      '[data-layout-modified="true"]'
    );
    modifiedParents.forEach((parent) => {
      parent.style.cssText = "";
      delete parent.dataset.layoutModified;
    });

    // 수정된 원본 자막 요소들 복원
    const modifiedElements = document.querySelectorAll("[data-original-style]");
    modifiedElements.forEach((element) => {
      element.style.cssText = element.dataset.originalStyle || "";
      delete element.dataset.originalStyle;
    });
  }

  // 정리
  destroy() {
    this.observers.forEach((observer) => observer.disconnect());
    this.observers.clear();

    // 모든 디바운스 타이머 정리
    this.elementDebounceTimers = new WeakMap();

    // 모든 번역 요소 제거 및 스타일 복원
    this.removeAllTranslations();
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
    if (request.enabled !== undefined) {
      // enabled 값이 직접 전달된 경우
      const wasEnabled = subtitleTranslator.isEnabled;
      subtitleTranslator.isEnabled = request.enabled;

      // 비활성화된 경우 번역 요소들 제거
      if (wasEnabled && !request.enabled) {
        subtitleTranslator.removeAllTranslations();
      }
    } else {
      // 기존 토글 방식
      subtitleTranslator?.toggle();
    }
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
