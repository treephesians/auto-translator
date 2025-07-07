// 자막 번역기 Content Script
class SubtitleTranslator {
  constructor() {
    this.isEnabled = true;
    this.observers = new Map();
    this.translatedElements = new WeakMap();
    this.lastProcessedText = "";
    this.debounceTimer = null;
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

    // 최적화된 DOM 변화 감지 (characterData 위주)
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "characterData") {
          // 텍스트 변경 - 가장 일반적인 자막 변화
          const element = mutation.target.parentElement;
          if (element && this.isSubtitleElement(element)) {
            this.processSubtitleElement(element);
          }
        } else if (mutation.type === "childList") {
          // 새 요소 추가 - 최소한의 처리
          mutation.addedNodes.forEach((node) => {
            if (
              node.nodeType === Node.ELEMENT_NODE &&
              this.isSubtitleElement(node)
            ) {
              this.processSubtitleElement(node);
            }
          });
        }
      });
    });

    // characterData 중심의 효율적인 관찰 설정
    observer.observe(document.body, {
      childList: true, // 최소한의 새 요소 감지
      subtree: true,
      characterData: true, // 메인 감지 대상
    });

    this.observers.set("main", observer);

    // 주기적으로 놓친 자막 확인 (백업 메커니즘)
    this.startPeriodicCheck();
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

  // 백업 메커니즘: 주기적 확인 (놓친 변화 대비)
  startPeriodicCheck() {
    setInterval(() => {
      this.quickSubtitleCheck();
    }, 1000); // 2초마다 빠른 체크
  }

  quickSubtitleCheck() {
    // 가장 일반적인 자막 클래스만 빠르게 확인
    const commonSelectors = [
      ".captions-display--captions-cue-text--TQ0DQ", // Udemy
      ".ytp-caption-segment", // YouTube
      ".player-timedtext", // Netflix
      ".vp-captions-text", // Vimeo
    ];

    commonSelectors.forEach((selector) => {
      const elements = document.querySelectorAll(selector);
      elements.forEach((element) => {
        const text = this.extractTextContent(element);
        if (text && text !== this.translatedElements.get(element)) {
          this.processSubtitleElement(element);
        }
      });
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

    // 중복 처리 방지
    if (
      this.translatedElements.has(element) &&
      this.translatedElements.get(element) === text
    ) {
      return;
    }

    // 디바운스 적용
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.translateAndInsert(element, text);
    }, 100);
  }

  extractTextContent(element) {
    let text = "";

    // 텍스트 노드만 추출
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let node;
    while ((node = walker.nextNode())) {
      text += node.textContent;
    }

    return text.trim();
  }

  async translateAndInsert(element, text) {
    try {
      // 번역 요청
      const translatedText = await this.requestTranslation(text);

      if (translatedText && translatedText !== text) {
        this.insertTranslatedSubtitle(element, translatedText);
        this.translatedElements.set(element, text);
      }
    } catch (error) {
      console.error("번역 실패:", error);
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

  insertTranslatedSubtitle(originalElement, translatedText) {
    // 기존 번역 제거
    const existingTranslation = originalElement.querySelector(
      ".translated-subtitle"
    );
    if (existingTranslation) {
      existingTranslation.remove();
    }

    // 새로운 번역 자막 생성
    const translatedElement = document.createElement("div");
    translatedElement.className = "translated-subtitle";
    translatedElement.textContent = translatedText;

    // 스타일 적용
    this.applyTranslatedSubtitleStyle(translatedElement);

    // 삽입 위치 결정
    this.insertTranslatedElement(originalElement, translatedElement);
  }

  applyTranslatedSubtitleStyle(element) {
    element.style.cssText = `
      font-size: ${this.settings.fontSize};
      color: ${this.settings.textColor};
      background-color: ${this.settings.backgroundColor};
      padding: 4px 8px;
      border-radius: 4px;
      margin-top: 4px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
      line-height: 1.4;
      text-align: center;
      word-wrap: break-word;
      z-index: 2147483647;
      position: relative;
    `;
  }

  insertTranslatedElement(originalElement, translatedElement) {
    const parent = originalElement.parentNode;
    if (parent) {
      // 원본 자막 바로 다음에 삽입
      if (originalElement.nextSibling) {
        parent.insertBefore(translatedElement, originalElement.nextSibling);
      } else {
        parent.appendChild(translatedElement);
      }
    }
  }

  // 설정 업데이트
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    this.reapplyStyles();
  }

  reapplyStyles() {
    const translatedElements = document.querySelectorAll(
      ".translated-subtitle"
    );
    translatedElements.forEach((element) => {
      this.applyTranslatedSubtitleStyle(element);
    });
  }

  // 활성화/비활성화
  toggle() {
    this.isEnabled = !this.isEnabled;

    if (!this.isEnabled) {
      // 모든 번역 자막 숨기기
      const translatedElements = document.querySelectorAll(
        ".translated-subtitle"
      );
      translatedElements.forEach((element) => {
        element.style.display = "none";
      });
    } else {
      // 번역 자막 다시 보이기
      const translatedElements = document.querySelectorAll(
        ".translated-subtitle"
      );
      translatedElements.forEach((element) => {
        element.style.display = "block";
      });
    }
  }

  // 정리
  destroy() {
    this.observers.forEach((observer) => observer.disconnect());
    this.observers.clear();

    const translatedElements = document.querySelectorAll(
      ".translated-subtitle"
    );
    translatedElements.forEach((element) => element.remove());

    clearTimeout(this.debounceTimer);
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
  }
});

// 페이지 언로드 시 정리
window.addEventListener("beforeunload", () => {
  subtitleTranslator?.destroy();
});
