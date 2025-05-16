import React from 'react';
import ContentPage from '@/components/layout/content-page';
import { Link } from 'wouter';

const TermsPage: React.FC = () => {
  const lastUpdated = 'April 1, 2025';

  return (
    <ContentPage 
      title="Terms of Service" 
      subtitle={`Last updated: ${lastUpdated}`}
    >
      <section className="mb-8">
        <p className="mb-4">
          These Terms of Service ("Terms") govern your access to and use of the VEDD trading chart analysis 
          platform ("Service"). Please read these Terms carefully before using our Service.
        </p>
        <p>
          By accessing or using our Service, you agree to be bound by these Terms. If you disagree with any part 
          of the terms, then you may not access the Service.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold mb-4">1. ACCOUNTS</h2>
        <p className="mb-4">
          When you create an account with us, you must provide accurate, complete, and current information. 
          Failure to do so constitutes a breach of the Terms, which may result in immediate termination of your 
          account on our Service.
        </p>
        <p className="mb-4">
          You are responsible for safeguarding the password that you use to access the Service and for any 
          activities or actions under your password.
        </p>
        <p>
          You agree not to share your account with any third party. You must notify us immediately upon becoming 
          aware of any breach of security or unauthorized use of your account.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold mb-4">2. SUBSCRIPTIONS</h2>
        <p className="mb-4">
          Some parts of the Service are billed on a subscription basis. You will be billed in advance on a 
          recurring and periodic basis, depending on the type of subscription plan you select.
        </p>
        <p className="mb-4">
          At the end of each period, your subscription will automatically renew under the same conditions unless 
          you cancel it or VEDD cancels it.
        </p>
        <p className="mb-4">
          You may cancel your subscription at any time through your account settings page. The cancellation will 
          take effect at the end of the current paid period.
        </p>
        <p>
          We reserve the right to modify, terminate, or otherwise amend our offered subscription plans.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold mb-4">3. FINANCIAL ADVICE DISCLAIMER</h2>
        <p className="mb-4">
          <strong>THE INFORMATION PROVIDED BY VEDD IS FOR INFORMATIONAL PURPOSES ONLY AND SHOULD NOT BE CONSIDERED 
          FINANCIAL ADVICE.</strong>
        </p>
        <p className="mb-4">
          Our Service analyzes trading charts using artificial intelligence to identify patterns, trends, and 
          potential trading opportunities. However, these analyses and recommendations should be considered as 
          tools to assist your trading decisions, not as definitive investment advice.
        </p>
        <p className="mb-4">
          Trading financial markets involves substantial risk, including the loss of principal. Past performance 
          of our analysis does not guarantee future results.
        </p>
        <p>
          You should consult with a qualified financial advisor before making any investment decisions. VEDD 
          is not responsible for any trading decisions, losses, or other outcomes resulting from using our Service.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold mb-4">4. INTELLECTUAL PROPERTY</h2>
        <p className="mb-4">
          The Service and its original content, features, and functionality are and will remain the exclusive 
          property of VEDD and its licensors. The Service is protected by copyright, trademark, and other laws of 
          both the United States and foreign countries.
        </p>
        <p>
          Our trademarks and trade dress may not be used in connection with any product or service without the 
          prior written consent of VEDD.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold mb-4">5. USER CONTENT</h2>
        <p className="mb-4">
          When you upload trading charts or other content to our Service, you retain ownership of your content. 
          However, you grant VEDD a worldwide, non-exclusive, royalty-free license to use, reproduce, modify, 
          adapt, publish, and display such content for the purpose of providing and improving our Service.
        </p>
        <p className="mb-4">
          You represent and warrant that you own or have the necessary rights to the content you upload, and that 
          such content does not violate the rights of any third party.
        </p>
        <p>
          We reserve the right to remove any content that violates these Terms or that we determine, in our sole 
          discretion, is otherwise offensive or inappropriate.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold mb-4">6. THIRD-PARTY SERVICES</h2>
        <p className="mb-4">
          Our Service may contain links to third-party websites or services that are not owned or controlled by VEDD.
        </p>
        <p className="mb-4">
          VEDD has no control over, and assumes no responsibility for, the content, privacy policies, or practices 
          of any third-party websites or services. You acknowledge and agree that VEDD shall not be responsible or 
          liable, directly or indirectly, for any damage or loss caused or alleged to be caused by or in connection 
          with the use of or reliance on any such content, goods, or services available on or through any such 
          websites or services.
        </p>
        <p>
          We strongly advise you to read the terms and conditions and privacy policies of any third-party websites 
          or services that you visit.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold mb-4">7. TERMINATION</h2>
        <p className="mb-4">
          We may terminate or suspend your account immediately, without prior notice or liability, for any reason 
          whatsoever, including without limitation if you breach the Terms.
        </p>
        <p className="mb-4">
          Upon termination, your right to use the Service will immediately cease. If you wish to terminate your 
          account, you may simply discontinue using the Service, or delete your account through the account 
          settings page.
        </p>
        <p>
          All provisions of the Terms which by their nature should survive termination shall survive termination, 
          including, without limitation, ownership provisions, warranty disclaimers, indemnity, and limitations of 
          liability.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold mb-4">8. LIMITATION OF LIABILITY</h2>
        <p className="mb-4">
          TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL VEDD, ITS AFFILIATES, AGENTS, 
          DIRECTORS, EMPLOYEES, SUPPLIERS, OR LICENSORS BE LIABLE FOR ANY INDIRECT, PUNITIVE, INCIDENTAL, SPECIAL, 
          CONSEQUENTIAL, OR EXEMPLARY DAMAGES, INCLUDING WITHOUT LIMITATION DAMAGES FOR LOSS OF PROFITS, GOODWILL, 
          USE, DATA, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR RELATING TO THE USE OF, OR INABILITY TO USE, 
          THIS SERVICE.
        </p>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, VEDD ASSUMES NO LIABILITY OR RESPONSIBILITY FOR ANY 
          TRADING DECISIONS, FINANCIAL LOSSES, OR OTHER DAMAGES RESULTING FROM THE USE OF OUR SERVICE OR RELIANCE 
          ON THE INFORMATION PROVIDED.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold mb-4">9. GOVERNING LAW</h2>
        <p>
          These Terms shall be governed and construed in accordance with the laws of the State of New York, 
          United States, without regard to its conflict of law provisions. Any disputes relating to these Terms 
          that cannot be resolved informally will be subject to the exclusive jurisdiction of the courts located 
          in New York County, New York.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-bold mb-4">10. CHANGES TO TERMS</h2>
        <p className="mb-4">
          We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a 
          revision is material, we will try to provide at least 30 days' notice prior to any new terms taking 
          effect.
        </p>
        <p>
          By continuing to access or use our Service after those revisions become effective, you agree to be 
          bound by the revised terms. If you do not agree to the new terms, please stop using the Service.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold mb-4">11. CONTACT US</h2>
        <p className="mb-4">
          If you have any questions about these Terms, please contact us at:
        </p>
        <div>
          <p className="font-medium">VEDD</p>
          <p>123 Trading Street</p>
          <p>New York, NY 10001</p>
          <p className="mt-2">
            <a href="mailto:legal@vedd.ai" className="text-primary hover:underline">
              legal@vedd.ai
            </a>
          </p>
          <p>+1 (555) 123-4567</p>
        </div>
      </section>

      <div className="mt-12 pt-8 border-t">
        <p className="text-muted-foreground text-sm">
          By using our Service, you acknowledge that you have read and agree to these Terms of Service as well as
          our <Link to="/privacy"><span className="text-primary hover:underline">Privacy Policy</span></Link>.
        </p>
      </div>
    </ContentPage>
  );
};

export default TermsPage;