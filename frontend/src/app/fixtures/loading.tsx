export default function LoadingFixtures() {
  return <div className="page-shell fixtures-page loading-shell" role="status" aria-label="กำลังโหลดตารางแข่งขัน">
    <div className="skeleton fixture-loading-hero" />
    <div className="skeleton loading-line" />
    {[1, 2, 3, 4].map((key) => <div key={key} className="skeleton fixture-loading-row" />)}
  </div>;
}
