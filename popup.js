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
    this.apiKeys = {
      google: "",
      deepl: "",
    };
    this.translationProvider = "libre";

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
        "apiKeys",
        "translationProvider",
        "isEnabled",
      ]);

      if (result.subtitleSettings) {
        this.settings = { ...this.settings, ...result.subtitleSettings };
      }

      if (result.apiKeys) {
        this.apiKeys = { ...this.apiKeys, ...result.apiKeys };
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

    // 번역 서비스 변경
    document
      .getElementById("translationProvider")
      .addEventListener("change", (e) => {
        this.translationProvider = e.target.value;
        this.updateProviderInfo();
      });

    // 대상 언어 변경
    document
      .getElementById("targetLanguage")
      .addEventListener("change", (e) => {
        this.settings.targetLanguage = e.target.value;
      });

    // API 키 변경
    document.getElementById("googleApiKey").addEventListener("change", (e) => {
      this.apiKeys.google = e.target.value;
    });

    document.getElementById("deeplApiKey").addEventListener("change", (e) => {
      this.apiKeys.deepl = e.target.value;
    });
  }

  updateUI() {
    // 상태 표시 업데이트
    this.updateStatus();

    // 설정 값들을 UI에 반영
    document.getElementById("targetLanguage").value =
      this.settings.targetLanguage;
    document.getElementById("translationProvider").value =
      this.translationProvider;

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

    // API 키
    document.getElementById("googleApiKey").value = this.apiKeys.google;
    document.getElementById("deeplApiKey").value = this.apiKeys.deepl;

    // 번역 서비스 정보 업데이트
    this.updateProviderInfo();
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

  updateProviderInfo() {
    const providerInfo = document.getElementById("providerInfo");

    switch (this.translationProvider) {
      case "libre":
        providerInfo.textContent =
          "무료 번역 서비스를 사용합니다. 더 정확한 번역을 위해서는 API 키를 설정해주세요.";
        break;
      case "google":
        providerInfo.textContent =
          "Google Translate API를 사용합니다. API 키가 필요합니다.";
        break;
      case "deepl":
        providerInfo.textContent =
          "DeepL API를 사용합니다. 더 정확한 번역을 제공하지만 API 키가 필요합니다.";
        break;
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

    // 설정 저장
    await chrome.storage.sync.set({ isEnabled: this.isEnabled });

    // 모든 탭에 토글 메시지 전송
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        try {
          await chrome.tabs.sendMessage(tab.id, { action: "toggle" });
        } catch (error) {
          // 일부 탭에서는 content script가 없을 수 있음
          console.log("Content script not found in tab:", tab.id);
        }
      }
    } catch (error) {
      console.error("탭 메시지 전송 실패:", error);
    }

    this.updateStatus();
  }

  async saveSettings() {
    try {
      // 배경 색상 업데이트
      this.updateBackgroundColor();

      // 모든 설정 저장
      await chrome.storage.sync.set({
        subtitleSettings: this.settings,
        apiKeys: this.apiKeys,
        translationProvider: this.translationProvider,
        isEnabled: this.isEnabled,
      });

      // Background script에 설정 업데이트 알림
      try {
        await chrome.runtime.sendMessage({
          action: "updateApiKeys",
          apiKeys: this.apiKeys,
        });

        await chrome.runtime.sendMessage({
          action: "updateTranslationProvider",
          provider: this.translationProvider,
        });
      } catch (error) {
        console.error("Background script 업데이트 실패:", error);
      }

      // 모든 탭에 설정 업데이트 메시지 전송
      try {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          try {
            await chrome.tabs.sendMessage(tab.id, {
              action: "updateSettings",
              settings: this.settings,
            });
          } catch (error) {
            console.log("Content script not found in tab:", tab.id);
          }
        }
      } catch (error) {
        console.error("설정 업데이트 메시지 전송 실패:", error);
      }

      // 성공 알림
      this.showNotification("설정이 저장되었습니다!", "success");
    } catch (error) {
      console.error("설정 저장 실패:", error);
      this.showNotification("설정 저장에 실패했습니다.", "error");
    }
  }

  async clearCache() {
    try {
      // Background script에 캐시 클리어 요청
      await chrome.runtime.sendMessage({ action: "clearCache" });

      this.showNotification("번역 캐시가 지워졌습니다!", "success");
    } catch (error) {
      console.error("캐시 지우기 실패:", error);
      this.showNotification("캐시 지우기에 실패했습니다.", "error");
    }
  }

  showNotification(message, type = "info") {
    // 간단한 알림 표시
    const notification = document.createElement("div");
    notification.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      padding: 10px 15px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      z-index: 10000;
      transition: opacity 0.3s;
      ${
        type === "success"
          ? "background: #d4edda; color: #155724; border: 1px solid #c3e6cb;"
          : ""
      }
      ${
        type === "error"
          ? "background: #f8d7da; color: #721c24; border: 1px solid #f1b0b7;"
          : ""
      }
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.opacity = "0";
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 2000);
  }

  // 현재 탭에서 번역기 테스트
  async testTranslator() {
    try {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tabs.length > 0) {
        const response = await chrome.tabs.sendMessage(tabs[0].id, {
          action: "test",
          text: "Hello, this is a test.",
        });

        if (response && response.success) {
          this.showNotification("번역 테스트가 성공했습니다!", "success");
        } else {
          this.showNotification("번역 테스트에 실패했습니다.", "error");
        }
      }
    } catch (error) {
      console.error("번역 테스트 실패:", error);
      this.showNotification("번역 테스트에 실패했습니다.", "error");
    }
  }
}

// 팝업 로드 시 초기화
document.addEventListener("DOMContentLoaded", () => {
  new PopupManager();
});

// 키보드 단축키
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    window.close();
  }
});
