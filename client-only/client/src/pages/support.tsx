import React from 'react';
import ContentPage from '@/components/layout/content-page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { Link } from 'wouter';
import { BookOpen, FileText, HelpCircle, LifeBuoy, MessageCircle, Phone } from 'lucide-react';

const SupportPage: React.FC = () => {
  const supportCategories = [
    {
      icon: BookOpen,
      title: 'Documentation',
      description: 'Read our comprehensive user guides and documentation',
      link: '#',
      linkText: 'Browse Documentation'
    },
    {
      icon: HelpCircle,
      title: 'FAQs',
      description: 'Find answers to commonly asked questions',
      link: '#faq',
      linkText: 'View FAQs'
    },
    {
      icon: MessageCircle,
      title: 'Live Chat',
      description: 'Chat with our support team in real-time (Pro plan and above)',
      link: '#',
      linkText: 'Start Chat'
    },
    {
      icon: FileText,
      title: 'Submit a Ticket',
      description: 'Create a support ticket for technical issues',
      link: '/contact',
      linkText: 'Create Ticket'
    },
    {
      icon: Phone, 
      title: 'Phone Support',
      description: 'Speak directly with our support team (Enterprise plan)',
      link: '/contact',
      linkText: 'Contact Us'
    },
    {
      icon: LifeBuoy,
      title: 'Community Forum',
      description: 'Connect with other VEDD users and share tips',
      link: '#',
      linkText: 'Join Community'
    }
  ];

  const faqs = [
    {
      question: 'What types of chart screenshots are supported?',
      answer: 'VEDD supports screenshots from MT4, MT5, and TradingView platforms. For best results, ensure the price action, indicators, and timeframe are clearly visible in your screenshot.'
    },
    {
      question: 'Do I need an OpenAI API key to use the platform?',
      answer: 'Yes, currently you need your own OpenAI API key with an active billing account to use the chart analysis feature. This ensures you have full control over your API usage and costs.'
    },
    {
      question: 'How accurate are the trading signals?',
      answer: 'Our AI models are trained on thousands of historical charts and real trading scenarios, achieving up to 80% pattern recognition accuracy in optimal conditions. However, trading signals should be used as part of a comprehensive trading strategy and not as standalone advice.'
    },
    {
      question: 'Can I analyze charts from any timeframe?',
      answer: 'Yes, VEDD can analyze charts from any timeframe, from 1-minute to monthly charts. The system will automatically detect the timeframe if visible in the screenshot.'
    },
    {
      question: 'How many analyses can I perform per day?',
      answer: 'The number of analyses depends on your subscription plan. Basic users can perform up to 10 analyses per day, Pro users up to 50, and Enterprise users have unlimited analyses.'
    },
    {
      question: 'Can I export my analysis results?',
      answer: 'Yes, you can export your analysis results in PDF format or save them to your account history for future reference.'
    },
    {
      question: 'Is my data secure?',
      answer: 'We take data security seriously. All chart uploads and analyses are encrypted in transit and at rest. We do not share your trading data with third parties. For more information, please see our Privacy Policy.'
    },
    {
      question: 'How do I cancel my subscription?',
      answer: 'You can cancel your subscription at any time from your Profile page. Navigate to the Subscription tab and click "Cancel Subscription". Your access will continue until the end of your current billing period.'
    }
  ];

  return (
    <ContentPage 
      title="Support Center" 
      subtitle="Find help and resources for using VEDD's trading chart analysis platform"
    >
      {/* Search */}
      <div className="mb-12">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center max-w-2xl mx-auto">
              <h2 className="text-2xl font-bold mb-4">How can we help you today?</h2>
              <p className="text-muted-foreground mb-6">
                Search our knowledge base for answers or browse the support resources below.
              </p>
              <div className="flex gap-2">
                <Input 
                  placeholder="Search for help articles..." 
                  className="max-w-lg"
                />
                <Button>Search</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Support Categories */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6">Support Resources</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {supportCategories.map((category, index) => {
            const Icon = category.icon;
            return (
              <Card key={index}>
                <CardHeader className="pb-2">
                  <div className="mb-2">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-xl">{category.title}</CardTitle>
                  <CardDescription>{category.description}</CardDescription>
                </CardHeader>
                <CardFooter>
                  {category.link.startsWith('#') ? (
                    <a href={category.link} className="text-primary hover:underline font-medium">
                      {category.linkText}
                    </a>
                  ) : (
                    <Link to={category.link}>
                      <span className="text-primary hover:underline font-medium cursor-pointer">
                        {category.linkText}
                      </span>
                    </Link>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </section>

      {/* FAQs */}
      <section className="mb-12" id="faq">
        <h2 className="text-2xl font-bold mb-6">Frequently Asked Questions</h2>
        <Card>
          <CardContent className="pt-6">
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq, index) => (
                <AccordionItem key={index} value={`item-${index}`}>
                  <AccordionTrigger className="text-left font-medium">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      </section>

      {/* Contact CTA */}
      <section>
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="text-center py-6">
              <h2 className="text-2xl font-bold mb-2">Still need help?</h2>
              <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
                Our support team is available to assist you with any questions or issues you may have.
              </p>
              <Button asChild>
                <Link to="/contact">
                  <span>Contact Support</span>
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </ContentPage>
  );
};

export default SupportPage;