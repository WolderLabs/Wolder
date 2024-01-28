using DeGA.Core;
using DeGA.Core.Pipeline;
using DeGA.CSharp;
using DeGA.CSharp.Actions;
using DeGA.CSharp.Compilation;
using DeGA.CSharp.OpenAI;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

var builder = Host.CreateApplicationBuilder();
builder.Logging.AddConsole();

var services = builder.Services;

services.AddDeGA(builder.Configuration.GetSection("DeGA"))
    .AddCSharpGeneration();

var host = builder.Build();

var mainProject = new DotNetProjectReference("FizzBuzz/FizzBuzz.csproj");

var pipelineBuilder = host.Services.GetRequiredService<GeneratorPipelineBuilder>();
var pipeline = pipelineBuilder.Build("FizzBuzz.Output");

pipeline
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
            """));

await pipeline.RunAsync();

// var projectGenerator = host.Services.GetRequiredService<DotNetProjectGenerator>();
// var project = await projectGenerator.CreateAsync("FizzBuzz/FizzBuzz.csproj", "Console App");
// var codeGeneratorFactory = host.Services.GetRequiredService<CodeGeneratorFactory>();
// var appCodeGenerator = codeGeneratorFactory.Create(project);
// await appCodeGenerator.CreateClassAsync(
//     "Program", "A main method that implements the common fizz buzz app.");
