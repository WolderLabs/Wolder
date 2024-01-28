namespace DeGA.Core.Assistants
{
    public interface IAIAssistant
    {
        Task<string> CompletePromptAsync(string prompt);
    }
}
