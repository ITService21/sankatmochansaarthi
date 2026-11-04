import { CallbackSection } from "../components/CallbackSection";
import { ClassesSection } from "../components/ClassesSection";
import { CtaBand } from "../components/CtaBand";
import { FaqSection } from "../components/FaqSection";
import { HeroSlider } from "../components/HeroSlider";
import { HowItWorks } from "../components/HowItWorks";
import { StatsStrip } from "../components/StatsStrip";
import { TrendingSection } from "../components/TrendingSection";
import { WhyChooseUs } from "../components/WhyChooseUs";

/** Public landing page (footer comes from PublicShell). */
export function LandingPage() {
  return (
    <>
      <HeroSlider />
      <StatsStrip />
      <HowItWorks />
      <TrendingSection />
      <ClassesSection />
      <WhyChooseUs />
      <CtaBand />
      <FaqSection />
      <CallbackSection />
    </>
  );
}
