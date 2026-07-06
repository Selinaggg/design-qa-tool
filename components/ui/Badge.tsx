import type { IssueSeverity } from '@/types';

interface BadgeProps {
  severity: IssueSeverity;
}

const styles: Record<IssueSeverity, string> = {
  Critical: 'bg-red-100 text-red-700 ring-1 ring-red-200',
  Major: 'bg-orange-100 text-orange-700 ring-1 ring-orange-200',
  Minor: 'bg-yellow-100 text-yellow-700 ring-1 ring-yellow-200',
};

export default function Badge({ severity }: BadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[severity]}`}>
      {severity}
    </span>
  );
}
