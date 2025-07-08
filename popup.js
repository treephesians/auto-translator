// Popup Script
class PopupManager {
  constructor() {
    this.isEnabled = true;
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.setupEventListeners();
    this.updateUI();
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(["isEnabled"]);

      if (result.isEnabled !== undefined) {
        this.isEnabled = result.isEnabled;
        console.log(
          `[Popup] 저장된 상태 로드: ${this.isEnabled ? "활성화" : "비활성화"}`
        );
      }
    } catch (error) {
      console.error("설정 로드 실패:", error);
    }
  }

  setupEventListeners() {
    // 토글 버튼
    document.getElementById("toggleButton").addEventListener("click", () => {
      this.toggleTranslator();
    });

    // 캐시 지우기 버튼
    document
      .getElementById("clearCacheButton")
      .addEventListener("click", () => {
        this.clearCache();
      });

    // 서버 테스트 버튼
    document
      .getElementById("testServerButton")
      .addEventListener("click", () => {
        this.testLibreTranslateServer();
      });
  }

  updateUI() {
    // 상태 표시 업데이트
    this.updateStatus();
  }

  updateStatus() {
    const statusDisplay = document.getElementById("statusDisplay");
    const statusText = document.getElementById("statusText");
    const toggleButton = document.getElementById("toggleButton");

    if (this.isEnabled) {
      statusDisplay.className = "status enabled";
      statusText.textContent = "자막 번역기가 활성화되었습니다.";
      toggleButton.textContent = "자막 번역기 끄기";
      toggleButton.classList.remove("disabled");
    } else {
      statusDisplay.className = "status disabled";
      statusText.textContent = "자막 번역기가 비활성화되었습니다.";
      toggleButton.textContent = "자막 번역기 켜기";
      toggleButton.classList.add("disabled");
    }
  }

  async toggleTranslator() {
    this.isEnabled = !this.isEnabled;

    try {
      await chrome.storage.sync.set({ isEnabled: this.isEnabled });
      this.updateStatus();

      // 백그라운드 스크립트에 상태 변경 알림
      chrome.runtime.sendMessage({
        action: "toggleEnabled",
        enabled: this.isEnabled,
      });

      this.showNotification(
        this.isEnabled
          ? "자막 번역기가 활성화되었습니다."
          : "자막 번역기가 비활성화되었습니다.",
        "success"
      );
    } catch (error) {
      console.error("토글 실패:", error);
      this.showNotification("설정 변경에 실패했습니다.", "error");
    }
  }

  async clearCache() {
    try {
      await chrome.storage.local.clear();
      this.showNotification("캐시가 지워졌습니다.", "success");
    } catch (error) {
      console.error("캐시 지우기 실패:", error);
      this.showNotification("캐시 지우기에 실패했습니다.", "error");
    }
  }

  async testLibreTranslateServer() {
    try {
      this.showNotification("LibreTranslate 서버 연결 확인 중...", "info");

      // 직접 서버에 요청
      const response = await fetch("http://localhost:5001/languages");

      if (response.ok) {
        const languages = await response.json();
        this.showNotification(
          `서버 연결 성공! 지원 언어: ${languages.length}개`,
          "success"
        );
      } else {
        this.showNotification(
          `서버 연결 실패: HTTP ${response.status}`,
          "error"
        );
      }
    } catch (error) {
      this.showNotification(
        `서버 연결 실패: ${error.message}. Docker에서 LibreTranslate 서버가 실행 중인지 확인하세요.`,
        "error"
      );
    }
  }

  showNotification(message, type = "info") {
    // 기존 알림 제거
    const existingNotification = document.querySelector(".notification");
    if (existingNotification) {
      existingNotification.remove();
    }

    // 새 알림 생성
    const notification = document.createElement("div");
    notification.className = `notification ${type}`;
    notification.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      padding: 10px 15px;
      border-radius: 4px;
      color: white;
      font-size: 12px;
      z-index: 10000;
      transition: opacity 0.3s;
      ${
        type === "success"
          ? "background-color: #28a745;"
          : type === "error"
          ? "background-color: #dc3545;"
          : "background-color: #17a2b8;"
      }
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    // 3초 후 제거
    setTimeout(() => {
      notification.style.opacity = "0";
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }
}

// DOM 로드 완료 시 초기화
document.addEventListener("DOMContentLoaded", () => {
  new PopupManager();
});

// 키보드 단축키
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    window.close();
  }
});
