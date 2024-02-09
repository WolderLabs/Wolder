using Wolder.CommandLine;
using Wolder.CommandLine.Actions;
using Wolder.Core;
using Wolder.CSharp;
using Wolder.CSharp.Actions;
using Wolder.CSharp.OpenAI;
using Wolder.CSharp.OpenAI.Actions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Wolder.Core.Workspace;

var builder = Host.CreateApplicationBuilder();
builder.Logging.AddConsole();

var services = builder.Services;

services.AddWolder(builder.Configuration.GetSection("Wolder"));

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
        new CompileProject(mainProject))
    .AddStep(ctx =>
        new RunCommand("dotnet run", mainProject.RelativeRoot, Interactive: true));

await pipeline.RunAsync();
