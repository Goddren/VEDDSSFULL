import React from 'react';
import ContentPage from '@/components/layout/content-page';

const PrivacyPage: React.FC = () => {
  const lastUpdated = 'April 1, 2025';

  return (
    <ContentPage 
      title="Privacy Policy" 
      subtitle={`Last updated: ${lastUpdated}`}
    >
      <section className="mb-8">
        <p className="mb-4">
          At VEDD, we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, 
          and safeguard your information when you use our trading chart analysis platform. Please read this 
          privacy policy carefully. If you do not agree with the terms of this privacy policy, please do not 
          access the application.
        </p>
        <p>
          We reserve the right to make changes to this Privacy Policy at any time and for any reason. 
          We will alert you about any changes by updating the "Last updated" date of this Privacy Policy. 
          You are encouraged to periodically review this Privacy Policy to stay informed of updates.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold mb-4">COLLECTION OF YOUR INFORMATION</h2>
        <p className="mb-4">
          We may collect information about you in a variety of ways. The information we may collect via the 
          Application includes:
        </p>

        <h3 className="text-lg font-medium mb-2">Personal Data</h3>
        <p className="mb-4">
          When you register with us, we collect personally identifiable information, such as your name, email 
          address, and other information you disclose voluntarily. If you choose to share OpenAI API 
          credentials, those are securely stored and used solely for the purpose of analyzing your trading charts.
        </p>

        <h3 className="text-lg font-medium mb-2">Trading Chart Data</h3>
        <p className="mb-4">
          Trading charts that you upload for analysis are processed to generate insights and recommendations. 
          These charts and their analyses may be stored in your account history unless you choose to delete them.
        </p>

        <h3 className="text-lg font-medium mb-2">Derivative Data</h3>
        <p className="mb-4">
          Information our servers automatically collect when you access the Application, such as your IP address, 
          browser type, operating system, access times, and the pages you have viewed directly before and after 
          accessing the Application.
        </p>

        <h3 className="text-lg font-medium mb-2">Financial Data</h3>
        <p className="mb-4">
          Financial information, such as data related to your payment method (e.g., valid credit card number, 
          card brand, expiration date) that we may collect when you purchase a subscription. All financial 
          information is stored by our payment processor, and you are encouraged to review their privacy policy 
          and contact them directly for responses to your questions.
        </p>

        <h3 className="text-lg font-medium mb-2">Usage Information</h3>
        <p>
          We track user engagement with charts, analyses performed, and features used to improve our service 
          and provide personalized experiences.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold mb-4">USE OF YOUR INFORMATION</h2>
        <p className="mb-4">
          Having accurate information about you permits us to provide you with a smooth, efficient, and 
          customized experience. Specifically, we may use information collected about you via the Application to:
        </p>

        <ul className="list-disc pl-6 space-y-2 mb-4">
          <li>Create and manage your account.</li>
          <li>Process chart analysis requests and deliver trading insights.</li>
          <li>Track your usage patterns and preferences to improve our platform.</li>
          <li>Process payments and refunds.</li>
          <li>Increase the efficiency and operation of the Application.</li>
          <li>Monitor and analyze usage and trends to improve your experience with the Application.</li>
          <li>Notify you of updates to the Application.</li>
          <li>Resolve disputes and troubleshoot problems.</li>
          <li>Prevent fraudulent transactions and monitor against theft.</li>
          <li>Request feedback and contact you about your use of the Application.</li>
          <li>Respond to product and customer service requests.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold mb-4">DISCLOSURE OF YOUR INFORMATION</h2>
        <p className="mb-4">
          We may share information we have collected about you in certain situations. Your information may be 
          disclosed as follows:
        </p>

        <h3 className="text-lg font-medium mb-2">By Law or to Protect Rights</h3>
        <p className="mb-4">
          If we believe the release of information about you is necessary to respond to legal process, to 
          investigate or remedy potential violations of our policies, or to protect the rights, property, and 
          safety of others, we may share your information as permitted or required by any applicable law, rule, 
          or regulation.
        </p>

        <h3 className="text-lg font-medium mb-2">Third-Party Service Providers</h3>
        <p className="mb-4">
          We may share your information with third parties that perform services for us or on our behalf, 
          including AI processing, payment processing, data analysis, email delivery, hosting services, 
          customer service, and marketing assistance.
        </p>

        <h3 className="text-lg font-medium mb-2">Business Transfers</h3>
        <p>
          If we or our subsidiaries are involved in a merger, acquisition, or asset sale, your information may 
          be transferred. We will provide notice before your information is transferred and becomes subject to a 
          different Privacy Policy.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold mb-4">SECURITY OF YOUR INFORMATION</h2>
        <p className="mb-4">
          We use administrative, technical, and physical security measures to help protect your personal 
          information. While we have taken reasonable steps to secure the personal information you provide to us, 
          please be aware that despite our efforts, no security measures are perfect or impenetrable, and no 
          method of data transmission can be guaranteed against any interception or other type of misuse.
        </p>
        <p>
          Any information disclosed online is vulnerable to interception and misuse by unauthorized parties. 
          Therefore, we cannot guarantee complete security if you provide personal information.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold mb-4">POLICY FOR CHILDREN</h2>
        <p>
          We do not knowingly solicit information from or market to children under the age of 13. If you become 
          aware of any data we have collected from children under age 13, please contact us using the contact 
          information provided below.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold mb-4">YOUR CALIFORNIA PRIVACY RIGHTS</h2>
        <p>
          California Civil Code Section 1798.83, also known as the "Shine The Light" law, permits our users who 
          are California residents to request and obtain from us, once a year and free of charge, information 
          about categories of personal information (if any) we disclosed to third parties for direct marketing 
          purposes and the names and addresses of all third parties with which we shared personal information in 
          the immediately preceding calendar year. If you are a California resident and would like to make such 
          a request, please submit your request in writing to us using the contact information provided below.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold mb-4">CONTACT US</h2>
        <p>
          If you have questions or comments about this Privacy Policy, please contact us at:
        </p>
        <div className="mt-4">
          <p className="font-medium">VEDD</p>
          <p>123 Trading Street</p>
          <p>New York, NY 10001</p>
          <p className="mt-2">
            <a href="mailto:privacy@vedd.ai" className="text-primary hover:underline">
              privacy@vedd.ai
            </a>
          </p>
          <p>+1 (555) 123-4567</p>
        </div>
      </section>
    </ContentPage>
  );
};

export default PrivacyPage;