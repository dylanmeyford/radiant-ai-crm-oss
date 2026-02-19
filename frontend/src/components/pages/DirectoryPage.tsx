import React, { useMemo, useState } from "react";
import { AlertCircle, ExternalLink, Filter, Globe, Tags, Link2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDirectoryProviders } from "@/hooks/useDirectoryProviders";
import { DirectoryProvider } from "@/types/directory";

const ProviderCard: React.FC<{ provider: DirectoryProvider }> = ({ provider }) => {
  const [imageErrored, setImageErrored] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const hostname = useMemo(() => {
    try {
      const parsed = new URL(provider.website || provider.link);
      return parsed.hostname.replace(/^www\./, "");
    } catch {
      return provider.website || provider.link || "";
    }
  }, [provider.link, provider.website]);

  const hasTags = Array.isArray(provider.tags) && provider.tags.length > 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
      <div className="p-4 flex gap-4">
        <div className="h-16 w-16 rounded-lg bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center shrink-0">
          {imageErrored || !provider.image ? (
            <span className="text-sm font-medium text-gray-600">{provider.name.charAt(0).toUpperCase()}</span>
          ) : (
            <img
              src={provider.image}
              alt={provider.name}
              className="h-full w-full object-cover"
              loading="lazy"
              onError={() => setImageErrored(true)}
            />
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-gray-900 truncate">{provider.name}</h3>
              <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                <Globe className="h-3.5 w-3.5 text-gray-500" />
                <span className="truncate">{hostname}</span>
              </div>
            </div>
            <Button
              asChild
              size="sm"
              className="px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 bg-gray-900 text-white hover:bg-gray-800"
            >
              <a href={provider.link} target="_blank" rel="noreferrer">
                {provider.linkText || "Visit"}
                <ExternalLink className="h-3.5 w-3.5 ml-1" />
              </a>
            </Button>
          </div>
          <p
            onClick={() => setIsExpanded(!isExpanded)}
            className={`text-sm text-gray-600 cursor-pointer hover:text-gray-900 transition-colors ${
              isExpanded ? "" : "line-clamp-3"
            }`}
            title={isExpanded ? "Click to collapse" : "Click to expand"}
          >
            {provider.description}
          </p>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Link2 className="h-3.5 w-3.5 text-gray-500" />
            <a
              href={provider.website || provider.link}
              target="_blank"
              rel="noreferrer"
              className="text-gray-600 hover:text-gray-900 underline underline-offset-4"
            >
              {provider.website || provider.link}
            </a>
          </div>
          {hasTags && (
            <div className="flex flex-wrap gap-2 pt-1">
              {provider.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700 border border-gray-200"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const DirectorySkeleton: React.FC = () => (
  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    {[...Array(6)].map((_, idx) => (
      <div key={idx} className="bg-white rounded-lg border border-gray-200">
        <div className="p-4 flex gap-4">
          <Skeleton className="h-16 w-16 rounded-lg" />
          <div className="flex-1 space-y-3">
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    ))}
  </div>
);

export default function DirectoryPage() {
  const { providers, isLoading, error, refetch } = useDirectoryProviders();
  const [activeTag, setActiveTag] = useState<string>("all");

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    providers.forEach((provider) => {
      provider.tags?.forEach((tag) => tags.add(tag));
    });
    return Array.from(tags).sort();
  }, [providers]);

  const filteredProviders = useMemo(() => {
    if (activeTag === "all") return providers;
    return providers.filter((provider) => provider.tags?.includes(activeTag));
  }, [activeTag, providers]);

  const showError = Boolean(error);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="p-4 overflow-y-auto space-y-4">
        <div className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-gray-600" />
              <h1 className="text-sm font-medium text-gray-900">Recommended Service Providers</h1>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Below is a curated list of service providers I recommend. None of these are paid affiliates, just good people I've worked with and trust.
            </p>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Filter className="h-4 w-4 text-gray-600" />
              <span className="text-sm font-medium text-gray-900">Filter by tag</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActiveTag("all")}
                className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-all duration-200 ${
                  activeTag === "all"
                    ? "bg-gray-900 text-white border-gray-900 shadow-sm"
                    : "text-gray-600 border-gray-200 hover:border-gray-300 hover:text-gray-900"
                }`}
              >
                All
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setActiveTag(tag)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-all duration-200 ${
                    activeTag === tag
                      ? "bg-gray-900 text-white border-gray-900 shadow-sm"
                      : "text-gray-600 border-gray-200 hover:border-gray-300 hover:text-gray-900"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Tags className="h-3.5 w-3.5" />
                    {tag}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {showError && (
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-4 flex gap-3 items-start">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <div className="space-y-1">
                <p className="text-sm text-red-600">Failed to load directory providers</p>
                <p className="text-xs text-gray-500">Please try again or refresh the page.</p>
                <Button
                  onClick={() => refetch()}
                  size="sm"
                  className="px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 bg-gray-900 text-white hover:bg-gray-800"
                >
                  Try again
                </Button>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <DirectorySkeleton />
        ) : filteredProviders.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-4 text-center space-y-2">
              <p className="text-sm font-medium text-gray-900">No providers found</p>
              <p className="text-xs text-gray-500">
                {activeTag === "all"
                  ? "We don't have providers to show right now."
                  : "Try selecting a different tag to see more providers."}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredProviders.map((provider) => (
              <ProviderCard key={provider._id} provider={provider} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


