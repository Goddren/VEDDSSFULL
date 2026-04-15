import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, XCircle, ChevronRight, Loader2, TrendingUp } from "lucide-react";

interface QuizQuestion {
  id: string | number;
  text: string;
  yesScore?: number;
}

interface QuizInfo {
  id: number;
  slug: string;
  title: string;
  headline: string | null;
  subheadline: string | null;
  questions: QuizQuestion[];
  ctaText: string | null;
  thankYouMessage: string | null;
  brandColor: string | null;
  isActive: boolean | null;
}

export default function AmbassadorLandingPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Array<{ questionId: string | number; answer: string }>>([]);
  const [phase, setPhase] = useState<"quiz" | "form" | "done">("quiz");
  const [animating, setAnimating] = useState(false);
  const [formData, setFormData] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [formError, setFormError] = useState("");

  const { data: quiz, isLoading, error } = useQuery<QuizInfo>({
    queryKey: ["/api/lp", slug, "info"],
    queryFn: async () => {
      const res = await fetch(`/api/lp/${slug}/info`);
      if (!res.ok) throw new Error("Landing page not found");
      return res.json();
    },
    enabled: !!slug,
  });

  const submitMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch(`/api/lp/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Submission failed" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      setPhase("done");
    },
  });

  const brandColor = quiz?.brandColor || "#ef4444";

  function handleAnswer(answer: "yes" | "no") {
    if (!quiz || animating) return;
    const questions = quiz.questions as QuizQuestion[];
    const q = questions[currentQuestion];
    const newAnswers = [...answers, { questionId: q.id, answer }];
    setAnswers(newAnswers);

    setAnimating(true);
    setTimeout(() => {
      setAnimating(false);
      if (currentQuestion + 1 < questions.length) {
        setCurrentQuestion(currentQuestion + 1);
      } else {
        setPhase("form");
      }
    }, 350);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.firstName.trim()) {
      setFormError("First name is required.");
      return;
    }
    if (!formData.email.trim()) {
      setFormError("Email is required.");
      return;
    }
    setFormError("");
    submitMutation.mutate({
      ...formData,
      answers,
    });
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-red-500" />
      </div>
    );
  }

  if (error || !quiz) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-center px-4">
        <div>
          <TrendingUp className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Page Not Found</h1>
          <p className="text-gray-400">This landing page doesn't exist or is no longer active.</p>
        </div>
      </div>
    );
  }

  const questions = quiz.questions as QuizQuestion[];

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="py-5 px-4 flex items-center justify-center border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: brandColor }}>
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <span className="text-white font-bold text-lg tracking-tight">VEDD Trading AI</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-lg">
          {/* Hero */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-extrabold text-white mb-3 leading-tight">
              {quiz.headline || "Are You Ready for Financial Freedom?"}
            </h1>
            <p className="text-gray-400 text-base">
              {quiz.subheadline || "Answer 5 quick questions to get your FREE trading assessment"}
            </p>
          </div>

          {/* Quiz Phase */}
          {phase === "quiz" && questions.length > 0 && (
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-6">
                {/* Progress */}
                <div className="flex items-center gap-2 mb-6">
                  {questions.map((_, i) => (
                    <div
                      key={i}
                      className="h-1.5 rounded-full flex-1 transition-all duration-300"
                      style={{
                        backgroundColor: i <= currentQuestion ? brandColor : "#374151",
                      }}
                    />
                  ))}
                </div>
                <p className="text-xs text-gray-500 mb-4">
                  Question {currentQuestion + 1} of {questions.length}
                </p>

                <div
                  className={`transition-all duration-300 ${animating ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"}`}
                >
                  <p className="text-white text-xl font-semibold text-center mb-8 leading-relaxed">
                    {questions[currentQuestion]?.text}
                  </p>

                  <div className="flex gap-4">
                    <Button
                      className="flex-1 h-14 text-lg font-bold gap-2 bg-green-600 hover:bg-green-500 text-white border-0"
                      onClick={() => handleAnswer("yes")}
                      disabled={animating}
                    >
                      <CheckCircle className="w-5 h-5" />
                      Yes
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 h-14 text-lg font-bold gap-2 border-gray-700 text-gray-300 hover:bg-gray-800"
                      onClick={() => handleAnswer("no")}
                      disabled={animating}
                    >
                      <XCircle className="w-5 h-5" />
                      No
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* No questions — jump straight to form */}
          {phase === "quiz" && questions.length === 0 && (
            <div className="text-center">
              <Button
                className="h-14 px-8 text-lg font-bold text-white"
                style={{ backgroundColor: brandColor }}
                onClick={() => setPhase("form")}
              >
                {quiz.ctaText || "Get My Free Trading Assessment"}
                <ChevronRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          )}

          {/* Contact Form Phase */}
          {phase === "form" && (
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-6">
                <h2 className="text-white text-xl font-bold mb-1 text-center">Almost there!</h2>
                <p className="text-gray-400 text-sm text-center mb-6">
                  Enter your details and your ambassador will send your personalized assessment.
                </p>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">First Name *</label>
                      <Input
                        className="bg-gray-800 border-gray-700 text-white placeholder-gray-500"
                        placeholder="John"
                        value={formData.firstName}
                        onChange={e => setFormData(d => ({ ...d, firstName: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">Last Name</label>
                      <Input
                        className="bg-gray-800 border-gray-700 text-white placeholder-gray-500"
                        placeholder="Doe"
                        value={formData.lastName}
                        onChange={e => setFormData(d => ({ ...d, lastName: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Email *</label>
                    <Input
                      type="email"
                      className="bg-gray-800 border-gray-700 text-white placeholder-gray-500"
                      placeholder="john@example.com"
                      value={formData.email}
                      onChange={e => setFormData(d => ({ ...d, email: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Phone (optional)</label>
                    <Input
                      type="tel"
                      className="bg-gray-800 border-gray-700 text-white placeholder-gray-500"
                      placeholder="+1 (555) 000-0000"
                      value={formData.phone}
                      onChange={e => setFormData(d => ({ ...d, phone: e.target.value }))}
                    />
                  </div>
                  {formError && <p className="text-red-400 text-sm">{formError}</p>}
                  {submitMutation.error && (
                    <p className="text-red-400 text-sm">{(submitMutation.error as Error).message}</p>
                  )}
                  <Button
                    type="submit"
                    className="w-full h-12 text-base font-bold text-white"
                    style={{ backgroundColor: brandColor }}
                    disabled={submitMutation.isPending}
                  >
                    {submitMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Submitting...</>
                    ) : (
                      <>{quiz.ctaText || "Get My Free Trading Assessment"} <ChevronRight className="w-4 h-4 ml-1" /></>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Done Phase */}
          {phase === "done" && (
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-8 text-center">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ backgroundColor: brandColor + "33" }}
                >
                  <CheckCircle className="w-8 h-8" style={{ color: brandColor }} />
                </div>
                <h2 className="text-white text-2xl font-bold mb-3">You're In!</h2>
                <p className="text-gray-300 leading-relaxed">
                  {quiz.thankYouMessage || "Thanks! Your ambassador will reach out within 24 hours."}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="py-4 text-center border-t border-gray-800">
        <p className="text-gray-600 text-xs">
          Powered by{" "}
          <span className="font-semibold" style={{ color: brandColor }}>
            VEDD Trading AI
          </span>{" "}
          · Your data is never sold or shared.
        </p>
      </div>
    </div>
  );
}
