import "./WelcomePage.css";

interface WelcomePageProps {
  onNavigateToPreview: () => void;
}

/**
 * 欢迎页 — 三阶段流程的第一阶段。
 * 显示项目说明、固定端点信息和"查看预设路线"按钮。
 * 不发任何 API 请求。
 */
export function WelcomePage({ onNavigateToPreview }: WelcomePageProps) {
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
