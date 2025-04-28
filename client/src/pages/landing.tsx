import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { 
  ArrowRight, 
  ArrowRight as ChevronRight,
  CircleDot,
  LineChart, 
  BarChart,
  Sparkles
} from "lucide-react";
import { motion } from "framer-motion";
import { EarlyAccessForm } from "@/components/early-access/early-access-form";
import logoImg from "@/assets/IMG_3645.png";
import introBg from "@/assets/vedd-style/intro.png";
import problemBg from "@/assets/vedd-style/problem.png";
import answerBg from "@/assets/vedd-style/answer.png";

export default function LandingPage() {
  // Animation variants for slide transitions
  const slideVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { 
        duration: 0.5,
        ease: "easeOut"
      }
    }
  };
  
  const fadeInVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { 
        duration: 0.8,
        ease: "easeOut" 
      }
    }
  };
  
  const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2
      }
    }
  };
  
  return (
    <div className="flex flex-col min-h-screen bg-[#fcf8ef]">
      {/* Header with Logo */}
      <header className="w-full border-b border-black/10 py-4 px-6">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center">
            <img src={logoImg} alt="VEDD Logo" className="h-12" />
            <span className="ml-2 text-xs text-red-500 italic font-light">seize the day divine</span>
          </div>
          <div className="flex items-center space-x-3">
            <div className="w-2 h-2 bg-black rounded-full"></div>
            <div className="w-2 h-2 bg-black rounded-full"></div>
            <div className="w-2 h-2 bg-black rounded-full"></div>
          </div>
        </div>
      </header>
      
      {/* Presentation Slides */}
      <div className="flex-1">
        {/* Intro Slide */}
        <motion.section 
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
          className="min-h-[90vh] w-full relative flex items-center justify-center px-4 py-8"
        >
          <div className="max-w-5xl w-full mx-auto">
            <motion.img 
              src={introBg} 
              alt="Introduction" 
              className="w-full h-auto object-contain max-h-[80vh]"
              variants={fadeInVariants}
            />
            
            <motion.div variants={slideVariants} className="mt-12 flex justify-end">
              <a href="#problem" className="flex items-center text-black text-sm hover:text-red-500 transition-colors duration-300">
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </a>
            </motion.div>
          </div>
        </motion.section>
        
        {/* Problem Slide */}
        <motion.section 
          id="problem"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={staggerContainer}
          className="min-h-[90vh] w-full relative flex items-center justify-center px-4 py-8 border-t border-black/10"
        >
          <div className="max-w-5xl w-full mx-auto">
            <motion.img 
              src={problemBg} 
              alt="The Problem" 
              className="w-full h-auto object-contain max-h-[80vh]"
              variants={fadeInVariants}
            />
            
            <motion.div variants={slideVariants} className="mt-12 flex justify-end">
              <a href="#solution" className="flex items-center text-black text-sm hover:text-red-500 transition-colors duration-300">
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </a>
            </motion.div>
          </div>
        </motion.section>
        
        {/* Solution Slide */}
        <motion.section 
          id="solution"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={staggerContainer}
          className="min-h-[90vh] w-full relative flex items-center justify-center px-4 py-8 border-t border-black/10"
        >
          <div className="max-w-5xl w-full mx-auto">
            <motion.img 
              src={answerBg} 
              alt="The Solution" 
              className="w-full h-auto object-contain max-h-[80vh]"
              variants={fadeInVariants}
            />
            
            <motion.div variants={slideVariants} className="mt-12 flex justify-between">
              <div className="flex items-center">
                <CircleDot className="h-3 w-3 text-red-500 mr-2" />
                <span className="text-xs text-black/70">Page 03 of 15</span>
              </div>
              <a href="#cta" className="flex items-center text-black text-sm hover:text-red-500 transition-colors duration-300">
                Try it now <ChevronRight className="ml-1 h-4 w-4" />
              </a>
            </motion.div>
          </div>
        </motion.section>
        
        {/* Call to Action */}
        <motion.section 
          id="cta"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={staggerContainer}
          className="min-h-[60vh] w-full relative flex items-center justify-center px-4 py-12 border-t border-black/10 bg-black text-white"
        >
          <div className="max-w-3xl w-full mx-auto text-center">
            <motion.h2 
              variants={slideVariants} 
              className="text-4xl md:text-5xl font-bold mb-8"
            >
              Elevate Your Trading
            </motion.h2>
            
            <motion.p 
              variants={slideVariants} 
              className="text-lg md:text-xl mb-10 text-gray-300"
            >
              Join traders who are using VEDD's AI-powered analysis to transform their results.
            </motion.p>
            
            <motion.div 
              variants={slideVariants}
              className="flex flex-col sm:flex-row gap-4 justify-center mt-8"
            >
              <Link href="/auth">
                <Button size="lg" className="bg-red-500 hover:bg-red-600 text-white font-medium">
                  Get Started <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              
              <EarlyAccessForm />
              
              <Link href="/subscription">
                <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10">
                  View Pricing
                </Button>
              </Link>
            </motion.div>
          </div>
        </motion.section>
      </div>
      
      {/* Footer */}
      <footer className="w-full border-t border-black/10 py-6 px-6 bg-[#fcf8ef]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center">
          <div className="flex items-center mb-4 md:mb-0">
            <img src={logoImg} alt="VEDD Logo" className="h-8" />
            <span className="ml-2 text-xs text-red-500 italic font-light">seize the day divine</span>
          </div>
          
          <div className="flex items-center space-x-8">
            <Link href="/blog" className="text-sm text-black hover:text-red-500 transition-colors duration-300">
              Blog
            </Link>
            <Link href="/subscription" className="text-sm text-black hover:text-red-500 transition-colors duration-300">
              Pricing
            </Link>
            <Link href="/auth" className="text-sm text-black hover:text-red-500 transition-colors duration-300">
              Login
            </Link>
            <Link href="/contact" className="text-sm text-black hover:text-red-500 transition-colors duration-300">
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}