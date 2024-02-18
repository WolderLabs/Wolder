using Azure.AI.OpenAI;
using Wolder.Core.Assistants;

namespace Wolder.OpenAI;

public class OpenAIAssistant(OpenAIClient client) 
    : IOpenAIAssistant
{
    public async Task<string> CompletePromptAsync(string prompt)
    {
        var options = new ChatCompletionsOptions()
        {
            Temperature = 0.1f,
            DeploymentName = "gpt-3.5-turbo-0125",
            //DeploymentName = "gpt-4-1106-preview",
            Messages =
            {
                new ChatRequestUserMessage(prompt)
            }
        };
        var response = await client.GetChatCompletionsAsync(options);
        return response.Value.Choices.FirstOrDefault()?.Message.Content ?? "";
    }
}