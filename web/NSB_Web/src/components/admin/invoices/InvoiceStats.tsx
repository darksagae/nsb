import { LeonIcon, type LeonIconName } from '@/components/admin/leon/LeonIcon';

type Stat = { label: string; value: number; icon: LeonIconName };

export function InvoiceStats({ stats }: { stats: Stat[] }) {
  return (
    <div className="row g-3 mb-4">
      {stats.map((stat) => (
        <div key={stat.label} className="col-6 col-md">
          <div className="leon-bezel-outer h-100">
            <div className="leon-bezel-inner h-100 d-flex flex-column justify-content-between">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <span className="leon-section-label">{stat.label}</span>
                <LeonIcon name={stat.icon} size={17} className="text-secondary" />
              </div>
              <span className="display-6 fw-bold text-dark mb-0 leon-num" data-leon-num="true">{stat.value}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
