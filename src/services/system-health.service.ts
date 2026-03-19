import { SystemStatus } from '../types/app.models';
import { geminiService } from './gemini.service';

export interface SystemHealthAnalysis {
  overallScore: number;
  summary: string;
  recommendations: {
    service: string;
    action: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }[];
  businessImpact: string;
}

class SystemHealthService {
  getSystemStatus(): Promise<SystemStatus[]> {
    const statuses: SystemStatus[] = [
      { serviceName: 'Plaid API', status: 'online', details: 'All systems operational.' },
      { serviceName: 'Gemini API', status: 'online', details: 'All systems operational.' },
      { serviceName: 'Authentication Service', status: 'degraded', details: 'Slight latency increase.' },
      { serviceName: 'Database', status: 'online', details: 'All systems operational.' },
    ];
    return Promise.resolve(statuses);
  }

  async getHealthAnalysis(): Promise<SystemHealthAnalysis> {
    const statuses = await this.getSystemStatus();
    return geminiService.analyzeSystemHealth(statuses);
  }
}

export const systemHealthService = new SystemHealthService();
