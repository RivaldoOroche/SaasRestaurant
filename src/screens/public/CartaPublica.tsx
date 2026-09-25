import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getPublicMenu } from "@/data/publicMenu";
import { Badge } from "@/components/ui/Badge";
import { useT, useLang } from "@/i18n";

export function CartaPublica() {
  const { slug = "" } = useParams();
  const t = useT();
  const { lang, setLang } = useLang();
  const { data, isLoading } = useQuery({
    queryKey: ["publicMenu", slug],
    queryFn: () => getPublicMenu(slug),
  });

  if (isLoading) {
    return <div className="min-h-screen grid place-items-center bg-bg text-muted">{t("carta.loading")}</div>;
  }
  if (!data) {
    return (
      <div className="min-h-screen grid place-items-center bg-bg text-muted p-6 text-center">
        {t("carta.notFound")}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-ink">
      {/* Cabecera de marca */}
      <header className="relative bg-shell text-white px-5 py-8 text-center">
        <button
          onClick={() => setLang(lang === "es" ? "en" : "es")}
          className="absolute top-3 right-3 rounded-md border border-white/25 px-2.5 py-1 text-xs font-semibold hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
          aria-label={lang === "es" ? "Switch to English" : "Cambiar a español"}
        >
          {t("carta.langToggle")}
        </button>
        <div className="mx-auto mb-3 h-12 w-12 rounded-xl bg-accent-cta grid place-items-center text-xl font-bold">
          {data.tenantName.charAt(0)}
        </div>
        <h1 className="text-2xl font-bold">{data.tenantName}</h1>
        <p className="text-white/60 text-sm mt-1">{t("carta.subtitle")}</p>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        {data.categories.map((cat) => {
          const items = data.items.filter((i) => i.categoryId === cat.id);
          if (items.length === 0) return null;
          return (
            <section key={cat.id}>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-xl">{cat.icon}</span>
                <h2 className="text-lg font-bold">{cat.name}</h2>
              </div>
              <ul className="space-y-3">
                {items.map((it) => (
                  <li key={it.id} className="flex gap-3 border-b border-border-soft pb-3 last:border-0">
                    <span className="text-2xl shrink-0">{it.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{it.name}</p>
                        {it.badge && <Badge tone="accent">{it.badge}</Badge>}
                        {it.veg && <Badge tone="success">{t("carta.veg")}</Badge>}
                        {it.spicy && <Badge tone="warning">{t("carta.spicy")}</Badge>}
                        {it.gf && <Badge tone="neutral">{t("carta.gf")}</Badge>}
                      </div>
                      {it.description && <p className="text-muted text-sm mt-0.5">{it.description}</p>}
                    </div>
                    <span className="font-mono font-semibold shrink-0">
                      {data.currencySym} {it.price.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        <footer className="text-center text-muted text-xs pt-4 pb-8">
          {t("carta.pricesNote")}
          <br />
          {t("carta.poweredBy")} <span className="text-accent font-semibold">Wayra POS</span>
        </footer>
      </main>
    </div>
  );
}
