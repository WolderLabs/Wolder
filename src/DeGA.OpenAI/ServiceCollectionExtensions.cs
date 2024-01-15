using Azure.AI.OpenAI;
using DeGA.Core;
using Microsoft.Extensions.DependencyInjection;

namespace DeGA.Assistant.OpenAI
{
    public static class ServiceCollectionExtensions
    {
        public static IServiceCollection AddOpenAIAssistant(this IServiceCollection services, string openAIApiKey)
        {
            services.AddSingleton<IAIAssistant, OpenAIAssistant>(s =>
            {
                var client = new OpenAIClient(openAIApiKey);
                return new OpenAIAssistant(client);
            });

            return services;
        }
    }
}
