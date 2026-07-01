import axios from 'axios';
import { AnalysisResult } from '@/types';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';

export async function analyseDocument(file: File): Promise<AnalysisResult> {
  const formData = new FormData();
  formData.append('document', file);

  const response = await axios.post(`${BACKEND_URL}/api/analyse`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000
  });

  return response.data.data as AnalysisResult;
}
