using DeGA.Core;
using DeGA.Core.Pipeline;
using DeGA.CSharp;
using DeGA.CSharp.Actions;
using DeGA.CSharp.OpenAI;
using DeGA.CSharp.OpenAI.Actions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

var builder = Host.CreateApplicationBuilder();
builder.Logging.AddConsole();

var services = builder.Services;

services.AddDeGA(builder.Configuration.GetSection("DeGA"))
    .AddCSharpGeneration();

var host = builder.Build();

var pipelineBuilder = host.Services.GetRequiredService<GeneratorPipelineBuilder>();

var pipeline = pipelineBuilder.Build("FizzBuzz.OpenAI.Output");

var mainProject = new DotNetProjectReference("FizzBuzz/FizzBuzz.csproj");

pipeline
    .AddStep(ctx => new CreateSdkGlobal(DotNetSdkVersion.Net8))
    .AddStep(ctx => 
        new CreateProject(mainProject, """
            <Project Sdk="Microsoft.NET.Sdk">
            
              <PropertyGroup>
                <OutputType>Exe</OutputType>
                <TargetFramework>net8.0</TargetFramework>
                <LangVersion>latest</LangVersion>
                <Nullable>enable</Nullable>
                <ImplicitUsings>enable</ImplicitUsings>
              </PropertyGroup>
            
            </Project>
            """))
    .AddStep(ctx => 
        new GenerateClass(
            mainProject,
            "Program", 
            "A main method that implements the common fizz buzz app."))
    .AddStep(ctx =>
        new CompileProject(mainProject));

await pipeline.RunAsync();
