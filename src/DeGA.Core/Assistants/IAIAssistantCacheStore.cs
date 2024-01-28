namespace DeGA.Core.Assistants;

public interface IAIAssistantCacheStore
{
    Task<string?> TryGetCachedAssistantResultAsync(string key);
    Task SetCachedAssistantResultAsync(string key, string result);
}