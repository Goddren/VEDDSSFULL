import React from 'react';
import VeddLogo from '@/components/ui/vedd-logo';
import { Link } from 'wouter';
import { Twitter, Linkedin, Facebook, Instagram, Github } from 'lucide-react';

const Footer: React.FC = () => {
  const footerLinks = [
    {
      title: 'Product',
      links: [
        { name: 'Features', href: '/' },
        { name: 'Pricing', href: '/subscription' },
        { name: 'Analysis', href: '/analysis' }
      ]
    },
    {
      title: 'Resources',
      links: [
        { name: 'Dashboard', href: '/dashboard' },
        { name: 'History', href: '/historical' },
        { name: 'Profile', href: '/profile' }
      ]
    },
    {
      title: 'Company',
      links: [
        { name: 'About', href: '/about' },
        { name: 'Contact', href: '/contact' },
        { name: 'Support', href: '/support' }
      ]
    },
    {
      title: 'Legal',
      links: [
        { name: 'Privacy', href: '/privacy' },
        { name: 'Terms', href: '/terms' },
        { name: 'Security', href: '/security' }
      ]
    }
  ];

  const socialLinks = [
    { icon: <Twitter className="h-5 w-5" />, href: 'https://twitter.com', label: 'Twitter' },
    { icon: <Linkedin className="h-5 w-5" />, href: 'https://linkedin.com', label: 'LinkedIn' },
    { icon: <Facebook className="h-5 w-5" />, href: 'https://facebook.com', label: 'Facebook' },
    { icon: <Instagram className="h-5 w-5" />, href: 'https://instagram.com', label: 'Instagram' },
    { icon: <Github className="h-5 w-5" />, href: 'https://github.com', label: 'GitHub' }
  ];

  return (
    <footer className="bg-background border-t py-8 mt-12">
      <div className="container mx-auto px-4 md:px-8">
        <div className="flex flex-col md:flex-row justify-between">
          <div className="mb-6 md:mb-0">
            <div className="flex items-center">
              <VeddLogo height={32} />
              <span className="ml-2 text-xl font-bold tracking-tight">VEDD</span>
            </div>
            <p className="text-muted-foreground mt-2">AI-powered Trading Chart Analysis</p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {footerLinks.map((section, index) => (
              <div key={index}>
                <h4 className="font-medium mb-4">{section.title}</h4>
                <ul className="space-y-2">
                  {section.links.map((link, linkIndex) => (
                    <li key={linkIndex}>
                      {link.href.startsWith('http') ? (
                        <a 
                          href={link.href} 
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {link.name}
                        </a>
                      ) : (
                        <Link to={link.href}>
                          <span className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                            {link.name}
                          </span>
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        
        <div className="border-t border-border mt-8 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-muted-foreground">&copy; {new Date().getFullYear()} VEDD. All rights reserved.</p>
          <div className="flex space-x-4 mt-4 md:mt-0">
            {socialLinks.map((link, index) => (
              <a 
                key={index} 
                href={link.href} 
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label={link.label}
                target="_blank"
                rel="noopener noreferrer"
              >
                {link.icon}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
