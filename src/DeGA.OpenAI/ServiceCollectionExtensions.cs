using Azure.AI.OpenAI;
using DeGA.Core;
using DeGA.Core.Assistants;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace DeGA.OpenAI;

public static class ServiceCollectionExtensions
{
    public static DeGAServiceBuilder AddOpenAIAssistant(this DeGAServiceBuilder builder)
    {
        builder.Services.AddScoped<IAIAssistant>(s =>
        {
            var client = new OpenAIClient(builder.Config["OpenAIApiKey"]
                ?? throw new InvalidOperationException("No OpenAI API key has been set."));
            var assistant = new OpenAIAssistant(client);
            var cache = ActivatorUtilities.CreateInstance<AIAssistantCacheProxy>(s, assistant);
            return cache;
        });

        return builder;
    }
}