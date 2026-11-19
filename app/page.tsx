import StoryCard from "@/components/StoryCard";
import { getStories } from "@/lib/stories";
import type { Story } from "@/lib/types";

export const dynamic = "force-dynamic";

const ORDER: Story["group"][] = ["Economy", "Tech", "Politics", "Sports", "Weather"];

export default async function Home() {
  const stories = await getStories();
  return (
    <>
      <section className="hero">
        <h1>What does the market charge for your story?</h1>
        <p>
          Each story is a basket of at least five live prediction markets. The index is the price of the whole basket,
          from 0 to 100.
        </p>
      </section>
      {ORDER.map((g) => {
        const list = stories.filter((s) => s.group === g);
        if (!list.length) return null;
        return (
          <section className="group" key={g}>
            <h2>{g}</h2>
            <div className="grid">
              {list.map((s) => (
                <StoryCard key={s.id} story={s} />
              ))}
            </div>
          </section>
        );
      })}
      {!stories.length && <p className="empty-state">No stories could be priced right now. Try again in a minute.</p>}
    </>
  );
}
