﻿using Azure.AI.OpenAI;
using Wolder.Core;
using Wolder.Core.Assistants;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Wolder.Core.Workspace;

namespace Wolder.OpenAI;

public static class ServiceCollectionExtensions
{
    public static GeneratorWorkspaceBuilder AddOpenAIAssistant(this GeneratorWorkspaceBuilder builder)
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