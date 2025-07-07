// 자막 번역기 Background Script
class TranslationService {
  constructor() {
    this.apiKeys = {
      google: "", // Google Translate API 키
      deepl: "", // DeepL API 키
    };
    this.translationProvider = "libre"; // 기본적으로 무료 서비스 사용
    this.cache = new Map();
    this.requestQueue = [];
    this.isProcessing = false;
    this.rateLimiter = {
      requests: 0,
      resetTime: Date.now() + 60000, // 1분마다 리셋
    };

    this.init();
  }

  init() {
    this.loadApiKeys();
    this.setupMessageListener();
    this.setupRateLimiter();
  }

  async loadApiKeys() {
    try {
      const result = await chrome.storage.sync.get([
        "apiKeys",
        "translationProvider",
      ]);
      if (result.apiKeys) {
        this.apiKeys = { ...this.apiKeys, ...result.apiKeys };
      }
      if (result.translationProvider) {
        this.translationProvider = result.translationProvider;
      }
    } catch (error) {
      console.log("API 키 로드 실패:", error);
    }
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "translate") {
        this.handleTranslationRequest(request, sendResponse);
        return true; // 비동기 응답을 위해 true 반환
      } else if (request.action === "updateApiKeys") {
        this.updateApiKeys(request.apiKeys);
        sendResponse({ success: true });
      } else if (request.action === "updateTranslationProvider") {
        this.updateTranslationProvider(request.provider);
        sendResponse({ success: true });
      } else if (request.action === "clearCache") {
        this.clearCache();
        sendResponse({ success: true });
      }
    });
  }

  setupRateLimiter() {
    setInterval(() => {
      this.rateLimiter.requests = 0;
      this.rateLimiter.resetTime = Date.now() + 60000;
    }, 60000);
  }

  async handleTranslationRequest(request, sendResponse) {
    const { text, targetLanguage = "ko" } = request;

    if (!text || text.length < 2) {
      sendResponse({ error: "텍스트가 너무 짧습니다." });
      return;
    }

    // 캐시 확인
    const cacheKey = `${text}-${targetLanguage}`;
    if (this.cache.has(cacheKey)) {
      sendResponse({ translatedText: this.cache.get(cacheKey) });
      return;
    }

    // 요청 큐에 추가
    this.requestQueue.push({ text, targetLanguage, sendResponse });

    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  async processQueue() {
    if (this.requestQueue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;

    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();
      await this.processTranslationRequest(request);

      // 요청 간격 제한
      await this.sleep(100);
    }

    this.isProcessing = false;
  }

  async processTranslationRequest({ text, targetLanguage, sendResponse }) {
    try {
      // 율제한 확인
      if (this.rateLimiter.requests >= 50) {
        sendResponse({ error: "요청 제한 초과. 잠시 후 다시 시도해주세요." });
        return;
      }

      this.rateLimiter.requests++;

      let translatedText = "";

      switch (this.translationProvider) {
        case "google":
          translatedText = await this.translateWithGoogle(text, targetLanguage);
          break;
        case "deepl":
          translatedText = await this.translateWithDeepL(text, targetLanguage);
          break;
        case "libre":
        default:
          translatedText = await this.translateWithLibre(text, targetLanguage);
          break;
      }

      if (translatedText) {
        // 캐시에 저장
        const cacheKey = `${text}-${targetLanguage}`;
        this.cache.set(cacheKey, translatedText);

        // 캐시 크기 제한
        if (this.cache.size > 1000) {
          const firstKey = this.cache.keys().next().value;
          this.cache.delete(firstKey);
        }

        sendResponse({ translatedText });
      } else {
        sendResponse({ error: "번역 실패" });
      }
    } catch (error) {
      console.error("번역 처리 중 오류:", error);
      sendResponse({ error: error.message });
    }
  }

  async translateWithGoogle(text, targetLanguage) {
    if (!this.apiKeys.google) {
      console.warn("Google Translate API 키가 설정되지 않았습니다.");
      return null;
    }

    try {
      const url = `https://translation.googleapis.com/language/translate/v2?key=${this.apiKeys.google}`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          q: text,
          target: targetLanguage,
          source: "auto",
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message);
      }

      return data.data.translations[0].translatedText;
    } catch (error) {
      console.error("Google Translate 오류:", error);
      return null;
    }
  }

  async translateWithDeepL(text, targetLanguage) {
    if (!this.apiKeys.deepl) {
      console.warn("DeepL API 키가 설정되지 않았습니다.");
      return null;
    }

    try {
      const url = "https://api-free.deepl.com/v2/translate";
      const formData = new FormData();
      formData.append("text", text);
      formData.append("target_lang", targetLanguage.toUpperCase());
      formData.append("auth_key", this.apiKeys.deepl);

      const response = await fetch(url, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (data.translations && data.translations.length > 0) {
        return data.translations[0].text;
      }

      return null;
    } catch (error) {
      console.error("DeepL 번역 오류:", error);
      return null;
    }
  }

  async translateWithLibre(text, targetLanguage) {
    try {
      // LibreTranslate 무료 서비스 사용
      const response = await fetch(
        "https://translate.argosopentech.com/translate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            q: text,
            source: "auto",
            target: targetLanguage,
            format: "text",
          }),
        }
      );

      const data = await response.json();

      if (data.translatedText) {
        return data.translatedText;
      }

      return null;
    } catch (error) {
      console.error("LibreTranslate 오류:", error);
      // 백업으로 간단한 MyMemory API 사용
      return await this.translateWithMyMemory(text, targetLanguage);
    }
  }

  async translateWithMyMemory(text, targetLanguage) {
    try {
      const sourceLang = "en"; // 자동 감지 대신 영어로 고정
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
        text
      )}&langpair=${sourceLang}|${targetLanguage}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.responseStatus === 200 && data.responseData) {
        return data.responseData.translatedText;
      }

      return null;
    } catch (error) {
      console.error("MyMemory 번역 오류:", error);
      return null;
    }
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // API 키 업데이트
  updateApiKeys(newKeys) {
    this.apiKeys = { ...this.apiKeys, ...newKeys };
    chrome.storage.sync.set({ apiKeys: this.apiKeys });
  }

  // 번역 제공자 변경
  updateTranslationProvider(provider) {
    this.translationProvider = provider;
    chrome.storage.sync.set({ translationProvider: provider });
  }

  // 캐시 클리어
  clearCache() {
    this.cache.clear();
  }
}

// 전역 인스턴스 생성
const translationService = new TranslationService();

// 확장자 설치 시 초기화
chrome.runtime.onInstalled.addListener(() => {
  console.log("자막 번역기 확장자가 설치되었습니다.");

  // 기본 설정 저장
  chrome.storage.sync.set({
    subtitleSettings: {
      targetLanguage: "ko",
      fontSize: "16px",
      backgroundColor: "rgba(0, 0, 0, 0.8)",
      textColor: "#ffffff",
      position: "bottom",
    },
    translationProvider: "libre",
  });
});

// 확장자 시작 시 초기화
chrome.runtime.onStartup.addListener(() => {
  console.log("자막 번역기 확장자가 시작되었습니다.");
});

// 탭 업데이트 시 처리
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    // 비디오 사이트인지 확인
    const videoSites = [
      "youtube.com",
      "netflix.com",
      "vimeo.com",
      "coursera.org",
      "udemy.com",
      "edx.org",
    ];

    const isVideoSite = videoSites.some((site) => tab.url.includes(site));

    if (isVideoSite) {
      // 알림 또는 추가 처리
      console.log("비디오 사이트에 접속했습니다:", tab.url);
    }
  }
});

// 컨텍스트 메뉴 추가
chrome.contextMenus.create({
  id: "toggleSubtitleTranslator",
  title: "자막 번역기 켜기/끄기",
  contexts: ["all"],
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "toggleSubtitleTranslator") {
    chrome.tabs.sendMessage(tab.id, { action: "toggle" });
  }
});
