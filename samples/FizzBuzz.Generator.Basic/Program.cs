using DurableTask.Core;
using Wolder.CommandLine;
using Wolder.CommandLine.Actions;
using Wolder.Core;
using Wolder.CSharp;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Wolder.Core.Workspace;

var builder = Host.CreateApplicationBuilder();
builder.Logging.AddConsole();

builder.Services.AddWolder(builder.Configuration.GetSection("Wolder"));

var host = builder.Build();

await host.Services.GetRequiredService<GeneratorWorkspaceBuilder>()
    .AddCommandLineActions()
    .AddCSharpActions()
    .RunAsync<FizzBuzzGenerator>("FizzBuzz.Basic.Output");

class FizzBuzzGenerator : IActionPlan
{
    public async Task<IOrchestrationWorkspaceState> RunAsync(IOrchestrationWorkspaceState initialState)
    {
        var webProject = new DotNetProjectReference("FizzBuzz/FizzBuzz.csproj");
        // return await initialState.RunActivityAsync<RunCommandActivity, RunCommand>(
        //     new RunCommand($"dotnet new blazor -o {webProject.Name} --interactivity server --empty"));
    }
}

// var pipelineBuilder = host.Services.GetRequiredService<GeneratorPipelineBuilder>();
//
// var pipeline = pipelineBuilder.Build("FizzBuzz.Basic.Output");
//
// var mainProject = new DotNetProjectReference("FizzBuzz/FizzBuzz.csproj");
//
// pipeline
//     .AddStep(ctx => new CreateSdkGlobal(DotNetSdkVersion.Net8))
//     .AddStep(ctx => 
//         new CreateProject(mainProject, """
//             <Project Sdk="Microsoft.NET.Sdk">
//             
//               <PropertyGroup>
//                 <OutputType>Exe</OutputType>
//                 <TargetFramework>net8.0</TargetFramework>
//                 <LangVersion>latest</LangVersion>
//                 <Nullable>enable</Nullable>
//                 <ImplicitUsings>enable</ImplicitUsings>
//               </PropertyGroup>
//             
//             </Project>
//             """))
//     .AddStep(ctx => 
//         new CreateClass(mainProject, "Program", """
//             for (int i = 1; i <= 100; i++)
//             {
//                 if (i % 3 == 0 && i % 5 == 0)
//                 {
//                     Console.WriteLine("FizzBuzz");
//                 }
//                 else if (i % 3 == 0)
//                 {
//                     Console.WriteLine("Fizz");
//                 }
//                 else if (i % 5 == 0)
//                 {
//                     Console.WriteLine("Buzz");
//                 }
//                 else
//                 {
//                     Console.WriteLine(i);
//                 }
//             }
//             """))
//     .AddStep(ctx =>
//         new CompileProject(mainProject))
//     .AddStep(ctx =>
//         new RunCommand("dotnet run", mainProject.RelativeRoot, Interactive: true));
//
// await pipeline.RunAsync();
