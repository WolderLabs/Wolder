using Azure.AI.OpenAI;
using DeGA.Core;
using Microsoft.Extensions.DependencyInjection;

namespace DeGA.Assistant.OpenAI
{
    public static class ServiceCollectionExtensions
    {
        public static IServiceCollection AddOpenAIAssistant(this IServiceCollection services, string openAIApiKey)
        {
            services.AddSingleton<IAIAssistant>(s =>
            {
                var client = new OpenAIClient(openAIApiKey);
                var assistant = new OpenAIAssistant(client);
                var cache = ActivatorUtilities.CreateInstance<AIAssistantCache>(s, assistant);
                return cache;
            });

            return services;
        }
    }
}
