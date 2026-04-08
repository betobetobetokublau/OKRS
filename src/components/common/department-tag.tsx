'use client';

import type { Department } from '@/types';

interface DepartmentTagProps {
  department: Department;
}

export function DepartmentTag({ department }: DepartmentTagProps) {
  return (
    <span
      className="Polaris-Tag"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '3px',
        fontSize: '1.2rem',
        backgroundColor: department.color + '20',
        color: department.color,
        border: `1px solid ${department.color}40`,
      }}
    >
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: department.color,
        }}
      />
      {department.name}
    </span>
  );
}
