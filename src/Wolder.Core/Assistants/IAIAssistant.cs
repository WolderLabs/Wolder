namespace Wolder.Core.Assistants;

public interface IAIAssistant
{
    Task<string> CompletePromptAsync(string prompt);
}