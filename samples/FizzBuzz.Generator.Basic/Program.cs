using Wolder.CommandLine;
using Wolder.CommandLine.Actions;
using Wolder.Core;
using Wolder.Core.Pipeline;
using Wolder.CSharp;
using Wolder.CSharp.Actions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

var builder = Host.CreateApplicationBuilder();
builder.Logging.AddConsole();

var services = builder.Services;

services.AddDeGA(builder.Configuration.GetSection("Wolder"))
    .AddCommandLineActions()
    .AddCSharpActions();

var host = builder.Build();

var pipelineBuilder = host.Services.GetRequiredService<GeneratorPipelineBuilder>();

var pipeline = pipelineBuilder.Build("FizzBuzz.Basic.Output");

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
        new CreateClass(mainProject, "Program", """
            for (int i = 1; i <= 100; i++)
            {
                if (i % 3 == 0 && i % 5 == 0)
                {
                    Console.WriteLine("FizzBuzz");
                }
                else if (i % 3 == 0)
                {
                    Console.WriteLine("Fizz");
                }
                else if (i % 5 == 0)
                {
                    Console.WriteLine("Buzz");
                }
                else
                {
                    Console.WriteLine(i);
                }
            }
            """))
    .AddStep(ctx =>
        new CompileProject(mainProject))
    .AddStep(ctx =>
        new RunCommand("dotnet run", mainProject.RelativeRoot, Interactive: true));

await pipeline.RunAsync();
