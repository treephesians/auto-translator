// Popup Script
class PopupManager {
  constructor() {
    this.isEnabled = true;
    this.settings = {
      targetLanguage: "ko",
      fontSize: "16px",
      backgroundColor: "rgba(0, 0, 0, 0.8)",
      textColor: "#ffffff",
      position: "bottom",
    };
    this.translationProvider = "mymemory";

    this.init();
  }

  async init() {
    await this.loadSettings();
    this.setupEventListeners();
    this.updateUI();
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get([
        "subtitleSettings",
        "translationProvider",
        "isEnabled",
      ]);

      if (result.subtitleSettings) {
        this.settings = { ...this.settings, ...result.subtitleSettings };
      }

      if (result.translationProvider) {
        this.translationProvider = result.translationProvider;
      }

      if (result.isEnabled !== undefined) {
        this.isEnabled = result.isEnabled;
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

    // 설정 저장 버튼
    document.getElementById("saveButton").addEventListener("click", () => {
      this.saveSettings();
    });

    // 캐시 지우기 버튼
    document
      .getElementById("clearCacheButton")
      .addEventListener("click", () => {
        this.clearCache();
      });

    // 글자 크기 슬라이더
    const fontSizeSlider = document.getElementById("fontSize");
    const fontSizeValue = document.getElementById("fontSizeValue");

    fontSizeSlider.addEventListener("input", (e) => {
      const value = e.target.value;
      fontSizeValue.textContent = value + "px";
      this.settings.fontSize = value + "px";
    });

    // 투명도 슬라이더
    const opacitySlider = document.getElementById("backgroundOpacity");
    const opacityValue = document.getElementById("backgroundOpacityValue");

    opacitySlider.addEventListener("input", (e) => {
      const value = e.target.value;
      opacityValue.textContent = value + "%";
      this.updateBackgroundColor();
    });

    // 색상 변경
    document.getElementById("textColor").addEventListener("change", (e) => {
      this.settings.textColor = e.target.value;
    });

    document
      .getElementById("backgroundColor")
      .addEventListener("change", (e) => {
        this.updateBackgroundColor();
      });

    // 대상 언어 변경
    document
      .getElementById("targetLanguage")
      .addEventListener("change", (e) => {
        this.settings.targetLanguage = e.target.value;
      });
  }

  updateUI() {
    // 상태 표시 업데이트
    this.updateStatus();

    // 설정 값들을 UI에 반영
    document.getElementById("targetLanguage").value =
      this.settings.targetLanguage;

    // 글자 크기
    const fontSizeNum = parseInt(this.settings.fontSize);
    document.getElementById("fontSize").value = fontSizeNum;
    document.getElementById("fontSizeValue").textContent = fontSizeNum + "px";

    // 색상
    document.getElementById("textColor").value = this.settings.textColor;

    // 배경 색상과 투명도 분리
    const bgColor = this.extractBackgroundColor();
    const opacity = this.extractBackgroundOpacity();

    document.getElementById("backgroundColor").value = bgColor;
    document.getElementById("backgroundOpacity").value = opacity;
    document.getElementById("backgroundOpacityValue").textContent =
      opacity + "%";
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

  extractBackgroundColor() {
    // rgba(0, 0, 0, 0.8) 형태에서 색상 추출
    const match = this.settings.backgroundColor.match(
      /rgba?\((\d+),\s*(\d+),\s*(\d+)/
    );
    if (match) {
      const r = parseInt(match[1]).toString(16).padStart(2, "0");
      const g = parseInt(match[2]).toString(16).padStart(2, "0");
      const b = parseInt(match[3]).toString(16).padStart(2, "0");
      return `#${r}${g}${b}`;
    }
    return "#000000";
  }

  extractBackgroundOpacity() {
    // rgba(0, 0, 0, 0.8) 형태에서 투명도 추출
    const match = this.settings.backgroundColor.match(
      /rgba?\([^,]+,[^,]+,[^,]+,?\s*([^)]+)\)/
    );
    if (match) {
      return Math.round(parseFloat(match[1]) * 100);
    }
    return 80;
  }

  updateBackgroundColor() {
    const colorPicker = document.getElementById("backgroundColor");
    const opacitySlider = document.getElementById("backgroundOpacity");

    const color = colorPicker.value;
    const opacity = opacitySlider.value / 100;

    // hex를 rgb로 변환
    const r = parseInt(color.substr(1, 2), 16);
    const g = parseInt(color.substr(3, 2), 16);
    const b = parseInt(color.substr(5, 2), 16);

    this.settings.backgroundColor = `rgba(${r}, ${g}, ${b}, ${opacity})`;
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

  async saveSettings() {
    this.updateBackgroundColor();

    try {
      await chrome.storage.sync.set({
        subtitleSettings: this.settings,
        translationProvider: this.translationProvider,
        isEnabled: this.isEnabled,
      });

      this.showNotification("설정이 저장되었습니다.", "success");
    } catch (error) {
      console.error("설정 저장 실패:", error);
      this.showNotification("설정 저장에 실패했습니다.", "error");
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

  async testTranslator() {
    try {
      this.showNotification("번역 테스트 중...", "info");

      const response = await chrome.runtime.sendMessage({
        action: "translate",
        text: "Hello, this is a test!",
        targetLanguage: this.settings.targetLanguage,
      });

      if (response.error) {
        this.showNotification(`번역 테스트 실패: ${response.error}`, "error");
      } else {
        this.showNotification(
          `번역 테스트 성공: ${response.translatedText}`,
          "success"
        );
      }
    } catch (error) {
      this.showNotification(`번역 테스트 중 오류: ${error.message}`, "error");
    }
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
