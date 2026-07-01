import { useState } from "react";
import { getApiBaseDisplay, setApiBase, clearApiBase } from "../services/api";
import "./WelcomePage.css";

interface WelcomePageProps {
  onNavigateToPreview: () => void;
}

export function WelcomePage({ onNavigateToPreview }: WelcomePageProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [apiUrl, setApiUrl] = useState(getApiBaseDisplay);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    const trimmed = apiUrl.trim();
    if (trimmed) {
      setApiBase(trimmed);
    } else {
      clearApiBase();
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const displayUrl = getApiBaseDisplay();
  const hasBackend = displayUrl && displayUrl !== "__OFFLINE__";

  return (
    <div className="welcome-page">
      <div className="welcome-page__content">
        <h1 className="welcome-page__title">校园通勤情绪地图</h1>
        <p className="welcome-page__subtitle">
          江南大学蠡湖校区 · 通勤情绪可视化工具
        </p>

        <div className="welcome-page__info">
          <div className="welcome-page__endpoint">
            <span className="welcome-page__endpoint-icon welcome-page__endpoint-icon--origin" />
            <div>
              <strong>起点</strong>
              <p>学生公寓区（留学生公寓）</p>
            </div>
          </div>
          <div className="welcome-page__endpoint">
            <span className="welcome-page__endpoint-icon welcome-page__endpoint-icon--destination" />
            <div>
              <strong>终点</strong>
              <p>第一教学楼</p>
            </div>
          </div>
        </div>

        <p className="welcome-page__description">
          本应用为你展示从学生公寓区到第一教学楼的两条推荐路线：
          <strong>最快路线</strong>和<strong>最少心累路线</strong>。
          你可以在地图上查看情绪热力图、记录通勤感受，并追踪七日通勤趋势。
        </p>

        <div className="welcome-page__api-status">
          {hasBackend ? (
            <span className="welcome-page__api-status-ok">
              已连接: {displayUrl}
            </span>
          ) : (
            <span className="welcome-page__api-status-offline">
              离线模式 — 点击下方设置服务器地址
            </span>
          )}
          <button
            className="welcome-page__settings-btn"
            onClick={() => { setShowSettings(!showSettings); setApiUrl(getApiBaseDisplay()); }}
            type="button"
          >
            {showSettings ? "收起设置" : "设置服务器地址"}
          </button>
        </div>

        {showSettings && (
          <div className="welcome-page__settings">
            <label className="welcome-page__settings-label">
              后端 API 地址
            </label>
            <input
              className="welcome-page__settings-input"
              placeholder="http://192.168.1.100:8080"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              type="text"
            />
            <div className="welcome-page__settings-actions">
              <button
                className="welcome-page__settings-save"
                onClick={handleSave}
                type="button"
              >
                {saved ? "已保存" : "保存"}
              </button>
              <button
                className="welcome-page__settings-clear"
                onClick={() => { clearApiBase(); setApiUrl(""); setSaved(true); setTimeout(() => setSaved(false), 2000); }}
                type="button"
              >
                清除
              </button>
            </div>
            <p className="welcome-page__settings-hint">
              电脑运行后端后，输入电脑的局域网 IP + 端口（如 http://192.168.x.x:8080），手机需连同一 WiFi
            </p>
          </div>
        )}

        <button
          className="welcome-page__cta"
          onClick={onNavigateToPreview}
          type="button"
        >
          查看预设路线
        </button>
      </div>
    </div>
  );
}