'use client';

import { useParams } from 'next/navigation';
import { ObjectiveDetail } from '@/components/objectives/objective-detail';

export default function ObjectiveDetailPage() {
  const params = useParams();
  const objectiveId = params.id as string;

  return <ObjectiveDetail objectiveId={objectiveId} />;
}
