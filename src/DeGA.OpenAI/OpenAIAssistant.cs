using Azure.AI.OpenAI;
using DeGA.Core;

namespace DeGA.OpenAI
{
    public class OpenAIAssistant : IAIAssistant
    {
        private readonly OpenAIClient _client;

        public OpenAIAssistant(OpenAIClient client) 
        {
            _client = client;
        }

        public async Task<string> CompletePromptAsync(string prompt)
        {
            var options = new ChatCompletionsOptions()
            {
                DeploymentName = "gpt-3.5-turbo-1106",
                //DeploymentName = "gpt-4-1106-preview",
                Messages = 
                {
                    new ChatRequestUserMessage(prompt)
                }
            };
            var response = await _client.GetChatCompletionsAsync(options);
            return response.Value.Choices.FirstOrDefault()?.Message.Content ?? "";
        }
    }
}
