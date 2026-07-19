import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Link } from 'wouter';
import { ArrowLeft, Award, Shield, Download, GraduationCap } from 'lucide-react';

interface AmbassadorCertification {
  certificateNumber: string;
  holderName: string;
  issueDate: string;
  finalScore: number;
  modulesCompleted: number;
  veddTokenBalance: number;
  certificateImageUrl: string | null;
}

interface WorkforceCertificate {
  id: number;
  courseId: number | null;
  certificateId: string;
  title: string;
  recipientName: string | null;
  score: number | null;
  ceuHours: number | null;
  issuedAt: string;
}

export default function CertificationsPage() {
  const { data: ambassadorCert, isLoading: ambLoading } = useQuery<AmbassadorCertification | null>({
    queryKey: ['/api/ambassador/certification'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/ambassador/certification');
      return res.json();
    },
  });

  const { data: workforceData, isLoading: wfLoading } = useQuery<{ certificates: WorkforceCertificate[] }>({
    queryKey: ['/api/workforce/certificates'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/workforce/certificates');
      return res.json();
    },
  });
  const workforceCerts = workforceData?.certificates ?? [];

  const isLoading = ambLoading || wfLoading;
  const totalCerts = (ambassadorCert ? 1 : 0) + workforceCerts.length;

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <div className="max-w-3xl mx-auto px-4 pt-6">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-white mb-4">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
        </Link>

        <div className="flex items-center gap-2.5 mb-1">
          <Award className="w-6 h-6 text-amber-400" />
          <h1 className="text-xl font-bold">Your Certifications</h1>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Every certificate you've earned across VEDD, all in one place. {totalCerts > 0 && `${totalCerts} earned so far.`}
        </p>

        {isLoading ? (
          <p className="text-xs text-gray-500">Loading...</p>
        ) : totalCerts === 0 ? (
          <div className="rounded-2xl border border-gray-700/60 bg-gray-900/50 p-10 text-center">
            <Award className="w-10 h-10 text-gray-700 mx-auto mb-3" />
            <p className="text-white font-bold mb-1">No certifications yet</p>
            <p className="text-xs text-gray-500 mb-4">Pass a Workforce Academy course quiz or complete Ambassador Training to earn your first certificate.</p>
            <div className="flex items-center justify-center gap-3">
              <Link href="/workforce-academy" className="text-xs font-bold text-indigo-400 hover:text-indigo-300">Workforce Academy →</Link>
              <Link href="/ambassador-training" className="text-xs font-bold text-amber-400 hover:text-amber-300">Ambassador Training →</Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {ambassadorCert && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <Shield className="w-5 h-5 text-amber-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-white">VEDD Ambassador Certification</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">Issued {new Date(ambassadorCert.issueDate).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-wide px-2 py-1 rounded bg-amber-900/30 text-amber-300 flex-shrink-0">Ambassador</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="rounded-lg bg-black/30 px-2.5 py-2 text-center">
                    <p className="text-[9px] text-gray-500 uppercase">Score</p>
                    <p className="text-sm font-black text-white">{ambassadorCert.finalScore}%</p>
                  </div>
                  <div className="rounded-lg bg-black/30 px-2.5 py-2 text-center">
                    <p className="text-[9px] text-gray-500 uppercase">Modules</p>
                    <p className="text-sm font-black text-white">{ambassadorCert.modulesCompleted}</p>
                  </div>
                  <div className="rounded-lg bg-black/30 px-2.5 py-2 text-center">
                    <p className="text-[9px] text-gray-500 uppercase">VEDD</p>
                    <p className="text-sm font-black text-amber-400">{ambassadorCert.veddTokenBalance}</p>
                  </div>
                </div>
                <p className="text-[10px] font-mono text-gray-600">Cert #{ambassadorCert.certificateNumber}</p>
                {ambassadorCert.certificateImageUrl && (
                  <a href={ambassadorCert.certificateImageUrl} download target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold text-amber-400 hover:text-amber-300">
                    <Download className="w-3 h-3" /> Download certificate
                  </a>
                )}
              </div>
            )}

            {workforceCerts.map(cert => (
              <div key={cert.id} className="rounded-2xl border border-indigo-500/25 bg-indigo-500/5 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <GraduationCap className="w-5 h-5 text-indigo-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-white">{cert.title}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">Issued {new Date(cert.issuedAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-wide px-2 py-1 rounded bg-indigo-900/30 text-indigo-300 flex-shrink-0">Workforce Academy</span>
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs">
                  {cert.score != null && <span className="text-gray-400">Score: <span className="text-white font-semibold">{cert.score}%</span></span>}
                  {cert.ceuHours != null && <span className="text-gray-400">CEU: <span className="text-white font-semibold">{cert.ceuHours}h</span></span>}
                </div>
                <p className="text-[10px] font-mono text-gray-600 mt-2">Cert #{cert.certificateId}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
