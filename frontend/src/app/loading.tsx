export default function Loading() {
  return <div className="page-shell loading-shell" role="status" aria-label="กำลังโหลดข้อมูล"><div className="loading-hero skeleton" /><div className="loading-line skeleton" /><div className="club-grid">{Array.from({ length: 20 }, (_, index) => <div className="loading-card skeleton" key={index} />)}</div><span className="sr-only">กำลังโหลดข้อมูล...</span></div>;
}
