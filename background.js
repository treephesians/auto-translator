// 자막 번역기 Background Script - 로컬 LibreTranslate 사용
class TranslationService {
  constructor() {
    this.libreTranslateBaseUrl = "http://localhost:5001";
    this.translationProvider = "libretranslate-local";
    this.requestQueue = [];
    this.isProcessing = false;
    // 로컬 서버는 요청 제한이 없으므로 제거
    this.init();
  }

  init() {
    this.setupMessageListener();
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "translate") {
        this.handleTranslationRequest(request, sendResponse);
        return true; // 비동기 응답을 위해 true 반환
      } else if (request.action === "toggleEnabled") {
        this.handleToggleEnabled(request, sender);
        sendResponse({ success: true });
      }
    });
  }

  async handleToggleEnabled(request, sender) {
    try {
      // 현재 탭에 토글 메시지 전송
      if (sender.tab) {
        chrome.tabs.sendMessage(sender.tab.id, {
          action: "toggle",
          enabled: request.enabled,
        });
      } else {
        // popup에서 호출된 경우, 현재 활성 탭을 찾아서 전송
        const [activeTab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });

        if (activeTab) {
          chrome.tabs
            .sendMessage(activeTab.id, {
              action: "toggle",
              enabled: request.enabled,
            })
            .catch(() => {
              // Content script가 로드되지 않은 경우 무시
              console.log("Content script not loaded in current tab");
            });
        }
      }

      console.log(
        `[Background] 번역기 토글: ${request.enabled ? "활성화" : "비활성화"}`
      );
    } catch (error) {
      console.error("토글 메시지 전송 실패:", error);
    }
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

      // 로컬 서버이므로 간격을 짧게 설정
      await this.sleep(100);
    }

    this.isProcessing = false;
  }

  async processTranslationRequest({ text, targetLanguage, sendResponse }) {
    try {
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

      let translatedText = await this.translateWithLibreTranslate(
        text,
        targetLanguage
      );

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

  async translateWithLibreTranslate(text, targetLanguage) {
    try {
      const url = `${this.libreTranslateBaseUrl}/translate`;

      const requestBody = {
        q: text,
        source: "en",
        target: targetLanguage,
      };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[LibreTranslate 오류] HTTP ${response.status}: ${errorText}`
        );
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.translatedText) {
        const translatedText = data.translatedText;
        console.log(`번역: ${translatedText}`);
        return translatedText;
      } else {
        console.error(`[LibreTranslate 오류] 번역 결과가 없습니다:`, data);
        return null;
      }
    } catch (error) {
      console.error(`[LibreTranslate 실패]`, error.message);
      return null;
    }
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // 테스트용 함수 - 로컬 LibreTranslate API 테스트
  async testLibreTranslateAPI() {
    try {
      console.log("[API 테스트] 로컬 LibreTranslate 테스트 시작");

      const testBody = {
        q: "Hello world!",
        source: "en",
        target: "ko",
      };

      const response = await fetch(`${this.libreTranslateBaseUrl}/translate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(testBody),
      });

      console.log("[API 테스트] 응답 상태:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[API 테스트] 오류 응답:", errorText);
        return;
      }

      const data = await response.json();
      console.log("[API 테스트] 성공 응답:", data);
    } catch (error) {
      console.error("[API 테스트] 예외 발생:", error);
    }
  }
}

// 서비스 초기화
new TranslationService();

// 확장자 설치 시 초기화
chrome.runtime.onInstalled.addListener(() => {
  console.log("자막 번역기 확장자가 설치되었습니다.");

  // 컨텍스트 메뉴 설정
  setupContextMenu();

  // MyMemory API 테스트 실행
  setTimeout(() => {
    // translationService.testMyMemoryAPI(); // 이 부분은 로컬 서버로 변경되었으므로 제거
  }, 1000);
});

// 확장자 시작 시에도 테스트 (개발 중 디버깅용)
chrome.runtime.onStartup.addListener(() => {
  console.log("자막 번역기 확장자가 시작되었습니다.");
  // 시작 시에도 컨텍스트 메뉴 설정
  setupContextMenu();
});

// 컨텍스트 메뉴 설정 함수
function setupContextMenu() {
  // 기존 컨텍스트 메뉴 모두 제거
  chrome.contextMenus.removeAll(() => {
    // 새로운 컨텍스트 메뉴 생성
    chrome.contextMenus.create({
      id: "toggleSubtitleTranslator",
      title: "자막 번역기 켜기/끄기",
      contexts: ["all"],
    });
  });
}

// 페이지 로드 완료 시 content script에 초기화 신호 전송
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.status === "complete" &&
    tab.url &&
    (tab.url.includes("youtube.com") || tab.url.includes("netflix.com"))
  ) {
    chrome.tabs.sendMessage(tabId, { action: "init" }).catch(() => {
      // Content script가 아직 로드되지 않았을 수 있음 - 무시
    });
  }
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
