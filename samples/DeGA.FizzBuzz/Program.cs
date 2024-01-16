﻿using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

using DeGA.Core;
using DeGA.Assistant.OpenAI;
using DeGA.Generator.CSharp.LayerActions;

var builder = Host.CreateApplicationBuilder();
builder.Logging.AddConsole();

builder.Services.AddDeGA("FizzBuzz.Output");
builder.Services.AddOpenAIAssistant(builder.Configuration["OpenAIApiKey"]
    ?? throw new InvalidOperationException("No OpenAI API key has been set."));

var host = builder.Build();

var generator = host.Services.GetRequiredService<Generator>();

await generator
    .AddLayer(generateFizzBuzz => 
        generateFizzBuzz
            .AddAction<GenerateProject, GenerateProjectOptions>(
                new GenerateProjectOptions("FizzBuzz", "Console App"))
            .AddAction<GenerateClass, GenerateClassOptions>(
                new GenerateClassOptions("Program", "A main method that implements the common fizz buzz app.")))
    .BuildAsync();
