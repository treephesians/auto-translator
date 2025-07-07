// 자막 번역기 Background Script
class TranslationService {
  constructor() {
    this.googleApiKey = "AIzaSyAMJXGdaeIqi9YGg0gna76ZjSwBYRrw-kY"; // Google Translate API 키를 직접 입력
    this.translationProvider = "google";
    this.requestQueue = [];
    this.isProcessing = false;
    this.rateLimiter = {
      requests: 0,
      resetTime: Date.now() + 60000, // 1분마다 리셋
    };

    this.init();
  }

  init() {
    this.setupMessageListener();
    this.setupRateLimiter();
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "translate") {
        this.handleTranslationRequest(request, sendResponse);
        return true; // 비동기 응답을 위해 true 반환
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
      // 요청 제한 확인
      if (this.rateLimiter.requests >= 100) {
        sendResponse({ error: "요청 제한 초과. 잠시 후 다시 시도해주세요." });
        return;
      }

      // targetLanguage가 2글자 ISO 639-1 코드인지 검증
      if (
        !targetLanguage ||
        typeof targetLanguage !== "string" ||
        targetLanguage.length !== 2
      ) {
        sendResponse({ error: `잘못된 target 언어 코드: ${targetLanguage}` });
        return;
      }

      // 번역할 텍스트가 2글자 이상인지 검증
      if (!text || typeof text !== "string" || text.trim().length < 2) {
        sendResponse({ error: "번역할 텍스트가 너무 짧거나 비어 있습니다." });
        return;
      }

      this.rateLimiter.requests++;

      // 요청 body를 명확하게 구성
      const body = {
        q: text,
        target: targetLanguage,
        source: "auto",
      };
      console.log("[Google Translate 요청] body:", body);

      let translatedText = await this.translateWithGoogle(body);

      if (translatedText) {
        sendResponse({ translatedText });
      } else {
        sendResponse({ error: "번역 실패" });
      }
    } catch (error) {
      console.error("번역 처리 중 오류:", error);
      sendResponse({ error: error.message });
    }
  }

  async translateWithGoogle(body) {
    if (!this.googleApiKey) {
      console.warn("Google Translate API 키가 설정되지 않았습니다.");
      return null;
    }

    try {
      const url = `https://translation.googleapis.com/language/translate/v2?key=${this.googleApiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
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

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
    translationProvider: "google",
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

chrome.alarms.create("keepAlive", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keepAlive") {
    // 워커를 깨우기만 하면 됨
    // console.log('Service worker keep-alive ping');
  }
});
