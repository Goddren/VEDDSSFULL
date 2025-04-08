import React from 'react';
import ContentPage from '@/components/layout/content-page';
import { Card, CardContent } from '@/components/ui/card';
import { Shield, Lock, Server, AlertTriangle, CheckCircle, Database } from 'lucide-react';

interface SecurityFeatureProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const SecurityFeature: React.FC<SecurityFeatureProps> = ({ icon, title, description }) => {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 mt-1">
        {icon}
      </div>
      <div>
        <h3 className="text-lg font-medium mb-2">{title}</h3>
        <p className="text-muted-foreground">{description}</p>
      </div>
    </div>
  );
};

const SecurityPage: React.FC = () => {
  const securityFeatures = [
    {
      icon: <Shield className="h-6 w-6 text-primary" />,
      title: 'End-to-End Encryption',
      description: 'All your chart uploads and analyses are encrypted in transit and at rest using industry-standard encryption protocols.'
    },
    {
      icon: <Lock className="h-6 w-6 text-primary" />,
      title: 'Secure Authentication',
      description: 'We use secure authentication mechanisms including password hashing and protection against brute force attacks.'
    },
    {
      icon: <Database className="h-6 w-6 text-primary" />,
      title: 'Data Protection',
      description: 'Your trading data and personal information are stored in secure, access-controlled databases with regular backups.'
    },
    {
      icon: <Server className="h-6 w-6 text-primary" />,
      title: 'Regular Security Audits',
      description: 'Our systems undergo regular security assessments and penetration tests to identify and address potential vulnerabilities.'
    },
    {
      icon: <AlertTriangle className="h-6 w-6 text-primary" />,
      title: 'Vulnerability Management',
      description: 'We maintain a comprehensive vulnerability management program to quickly address security issues.'
    },
    {
      icon: <CheckCircle className="h-6 w-6 text-primary" />,
      title: 'Compliance',
      description: 'Our security practices comply with industry standards and regulations for protecting user data.'
    }
  ];

  return (
    <ContentPage 
      title="Security at VEDD" 
      subtitle="How we protect your data and privacy"
    >
      <section className="mb-12">
        <p className="mb-4">
          At VEDD, we prioritize the security of your data and privacy. This page outlines the security 
          measures we have implemented to protect your information while using our trading chart analysis platform.
        </p>
        <p>
          Our security strategy is built on a multi-layered approach that includes data encryption, secure 
          infrastructure, regular security audits, and strict access controls. We continuously monitor our 
          systems for potential vulnerabilities and stay up-to-date with the latest security best practices.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6">Our Security Measures</h2>
        <div className="grid gap-8 md:grid-cols-2">
          {securityFeatures.map((feature, index) => (
            <SecurityFeature 
              key={index}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
            />
          ))}
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6">API Key Security</h2>
        <Card>
          <CardContent className="pt-6">
            <p className="mb-4">
              When you provide your OpenAI API key to use our chart analysis features, we take extra precautions 
              to ensure the security of your credentials:
            </p>
            <ul className="list-disc pl-6 space-y-3">
              <li>
                <span className="font-medium">Encrypted Storage:</span>{' '}
                Your API key is encrypted using industry-standard encryption before being stored in our database.
              </li>
              <li>
                <span className="font-medium">No Key Sharing:</span>{' '}
                Your API key is never shared with third parties or other users.
              </li>
              <li>
                <span className="font-medium">Restricted Access:</span>{' '}
                Access to API keys is strictly limited to necessary system processes and is not accessible by employees.
              </li>
              <li>
                <span className="font-medium">Secure Transmission:</span>{' '}
                All API key transmissions occur over secure, encrypted connections.
              </li>
              <li>
                <span className="font-medium">Key Masking:</span>{' '}
                When displayed in the UI, your API key is masked to prevent unauthorized viewing.
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6">How You Can Enhance Your Security</h2>
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-medium mb-2">Use Strong, Unique Passwords</h3>
            <p className="text-muted-foreground">
              Create a password that's at least 12 characters long, with a mix of upper and lowercase letters, 
              numbers, and special characters. Avoid using the same password across multiple services.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-medium mb-2">Keep Your Devices Secure</h3>
            <p className="text-muted-foreground">
              Ensure your devices have the latest security updates, use anti-virus software, and lock your 
              devices when not in use.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-medium mb-2">Be Cautious with Public Wi-Fi</h3>
            <p className="text-muted-foreground">
              Avoid accessing your VEDD account on public or unsecured Wi-Fi networks. If you must use public Wi-Fi, 
              consider using a VPN service.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-medium mb-2">Log Out After Use</h3>
            <p className="text-muted-foreground">
              Always log out of your account when using shared or public computers.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-medium mb-2">Monitor Account Activity</h3>
            <p className="text-muted-foreground">
              Regularly check your account activity and report any suspicious actions immediately.
            </p>
          </div>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6">Reporting Security Issues</h2>
        <p className="mb-4">
          If you discover a security vulnerability or have concerns about the security of your account, please 
          contact us immediately at <a href="mailto:security@vedd.ai" className="text-primary hover:underline">security@vedd.ai</a>.
        </p>
        <p>
          We appreciate the efforts of security researchers and the community in helping us maintain a secure 
          platform. We are committed to investigating all legitimate reports and keeping affected users informed 
          of any issues that may impact them.
        </p>
      </section>

      <section>
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-6 pb-6">
            <div className="flex items-start gap-4">
              <Shield className="h-8 w-8 text-primary flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-lg font-bold mb-2">Our Security Commitment</h3>
                <p className="text-muted-foreground">
                  We're committed to continuously improving our security measures and protecting your data. 
                  We regularly update our security practices to address new threats and vulnerabilities. 
                  Your trust is important to us, and we strive to earn it every day by maintaining the highest 
                  standards of security.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </ContentPage>
  );
};

export default SecurityPage;